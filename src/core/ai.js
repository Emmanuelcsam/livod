const path = require('path');
const fs = require('fs/promises');
const fssync = require('fs');
const crypto = require('crypto');
const diff = require('diff');
const {
  ensureDir,
  pathExists,
  makeIgnoreMatcher,
  copyDir,
  walkDir,
  readJson,
  writeJson
} = require('../shared/fs');
const { headLines, tailLines } = require('../shared/text');

const DEFAULT_AI = {
  enabled: true,
  verbose: true,
  maxFileBytes: 512 * 1024,
  maxDiffBytes: 128 * 1024,
  maxOutputBytes: 32 * 1024,
  includeOutputs: true,
  baseline: true,
  journal: true,
  intentNotes: true,
  scanAllOnDirChange: true,
  compact: {
    enabled: true,
    maxDiffLines: 80,
    maxStdoutLines: 20,
    maxStderrLines: 60
  }
};

function resolveAiConfig(config) {
  const user = (config && config.ai) || {};
  return {
    ...DEFAULT_AI,
    ...user,
    compact: { ...DEFAULT_AI.compact, ...(user.compact || {}) }
  };
}

function aiPaths(sandboxRoot) {
  const root = path.join(sandboxRoot, '.livod', 'ai');
  return {
    root,
    baselineRoot: path.join(root, 'baseline'),
    indexPath: path.join(root, 'baseline-index.json'),
    sessionPath: path.join(root, 'session.json'),
    journalPath: path.join(root, 'changes.ndjson'),
    lastRunPath: path.join(root, 'last_run.json'),
    contextPath: path.join(root, 'context.md'),
    contextCompactPath: path.join(root, 'context.compact.md'),
    intentPath: path.join(root, 'intent.md'),
    ollamaRoot: path.join(root, 'ollama'),
    ollamaLastPromptPath: path.join(root, 'ollama', 'last_prompt.md'),
    ollamaLastResponsePath: path.join(root, 'ollama', 'last_response.md')
  };
}

function nowIso() {
  return new Date().toISOString();
}

async function safeReadJson(filePath, fallback) {
  if (!(await pathExists(filePath))) return fallback;
  try {
    return await readJson(filePath);
  } catch {
    return fallback;
  }
}

async function readTextMaybe(filePath, maxBytes) {
  const stat = await fs.stat(filePath);
  if (stat.size > maxBytes) {
    return { ok: false, reason: 'too_large', size: stat.size };
  }
  const data = await fs.readFile(filePath);
  if (data.includes(0)) {
    return { ok: false, reason: 'binary', size: stat.size };
  }
  return { ok: true, text: data.toString('utf8'), size: stat.size };
}

async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const stream = fssync.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function getFileInfo(filePath) {
  const stat = await fs.lstat(filePath);
  if (stat.isSymbolicLink()) {
    const linkTarget = await fs.readlink(filePath);
    return { type: 'symlink', linkTarget };
  }
  if (stat.isFile()) {
    const hash = await hashFile(filePath);
    return { type: 'file', hash, size: stat.size };
  }
  return { type: 'other' };
}

function makeSandboxIgnore(config) {
  const ignoreMatcher = makeIgnoreMatcher(config.ignore || []);
  return (rel) => {
    if (!rel) return false;
    if (rel === '.livod' || rel.startsWith(`.livod${path.sep}`)) return true;
    return ignoreMatcher(rel);
  };
}

async function buildBaselineIndex({ root, ignore }) {
  const files = {};
  await walkDir(root, ignore, async ({ full, rel, dirent }) => {
    if (!rel) return;
    if (dirent.isDirectory()) return;
    if (dirent.isSymbolicLink()) {
      const linkTarget = await fs.readlink(full);
      files[rel] = { type: 'symlink', linkTarget };
      return;
    }
    if (dirent.isFile()) {
      const hash = await hashFile(full);
      const stat = await fs.stat(full);
      files[rel] = { type: 'file', hash, size: stat.size };
    }
  }, root);

  return { files, updatedAt: nowIso() };
}

async function ensureBaseline({ sandboxRoot, config, aiConfig, paths }) {
  if (!aiConfig.baseline) return;
  if (!(await pathExists(paths.baselineRoot))) {
    await ensureDir(paths.baselineRoot);
    const ignore = makeSandboxIgnore(config);
    await copyDir(sandboxRoot, paths.baselineRoot, ignore);
    const index = await buildBaselineIndex({ root: paths.baselineRoot, ignore });
    await writeJson(paths.indexPath, index);
  }
}

async function loadBaselineIndex(paths) {
  return safeReadJson(paths.indexPath, { files: {}, updatedAt: null });
}

async function writeBaselineIndex(paths, index) {
  index.updatedAt = nowIso();
  await writeJson(paths.indexPath, index);
}

async function listSandboxFiles({ sandboxRoot, ignore }) {
  const files = new Map();
  await walkDir(sandboxRoot, ignore, async ({ full, rel, dirent }) => {
    if (!rel) return;
    if (dirent.isDirectory()) return;
    files.set(rel, { full, dirent });
  }, sandboxRoot);
  return files;
}

async function computeDiffForChange({ rel, type, sandboxPath, baselinePath, aiConfig }) {
  if (type === 'deleted') {
    if (!(await pathExists(baselinePath))) return null;
    const prev = await readTextMaybe(baselinePath, aiConfig.maxFileBytes);
    if (!prev.ok) {
      return { diff: null, reason: prev.reason, size: prev.size };
    }
    const patch = diff.createTwoFilesPatch(rel, rel, prev.text, '', '', '', { context: 3 });
    const truncated = patch.length > aiConfig.maxDiffBytes;
    return { diff: truncated ? patch.slice(0, aiConfig.maxDiffBytes) : patch, truncated };
  }

  if (type === 'added') {
    if (!(await pathExists(sandboxPath))) return null;
    const next = await readTextMaybe(sandboxPath, aiConfig.maxFileBytes);
    if (!next.ok) {
      return { diff: null, reason: next.reason, size: next.size };
    }
    const patch = diff.createTwoFilesPatch(rel, rel, '', next.text, '', '', { context: 3 });
    const truncated = patch.length > aiConfig.maxDiffBytes;
    return { diff: truncated ? patch.slice(0, aiConfig.maxDiffBytes) : patch, truncated };
  }

  if (!(await pathExists(baselinePath)) || !(await pathExists(sandboxPath))) return null;
  const prev = await readTextMaybe(baselinePath, aiConfig.maxFileBytes);
  const next = await readTextMaybe(sandboxPath, aiConfig.maxFileBytes);
  if (!prev.ok || !next.ok) {
    const reason = !prev.ok ? prev.reason : next.reason;
    const size = !prev.ok ? prev.size : next.size;
    return { diff: null, reason, size };
  }
  if (prev.text === next.text) return null;
  const patch = diff.createTwoFilesPatch(rel, rel, prev.text, next.text, '', '', { context: 3 });
  const truncated = patch.length > aiConfig.maxDiffBytes;
  return { diff: truncated ? patch.slice(0, aiConfig.maxDiffBytes) : patch, truncated };
}

async function updateBaselineFile({ rel, sandboxPath, baselinePath, info }) {
  await ensureDir(path.dirname(baselinePath));
  if (info.type === 'symlink') {
    await fs.rm(baselinePath, { force: true, recursive: true });
    await fs.symlink(info.linkTarget, baselinePath);
    return;
  }
  await fs.copyFile(sandboxPath, baselinePath);
}

async function computeChanges({ sandboxRoot, config, aiConfig, paths, changeHint }) {
  const ignore = makeSandboxIgnore(config);
  const index = await loadBaselineIndex(paths);
  const changes = [];
  const pendingUpdates = [];

  const applyChange = (rel, type, detail) => {
    changes.push({ path: rel, type, ...detail });
  };

  const processChangePath = async (rel) => {
    const sandboxPath = path.join(sandboxRoot, rel);
    const baselinePath = path.join(paths.baselineRoot, rel);
    const existsSandbox = await pathExists(sandboxPath);
    const existsBaseline = Object.prototype.hasOwnProperty.call(index.files, rel);

    if (!existsSandbox && !existsBaseline) return;

    if (!existsSandbox && existsBaseline) {
      applyChange(rel, 'deleted', {});
      pendingUpdates.push({ rel, action: 'delete', baselinePath });
      return;
    }

    const info = await getFileInfo(sandboxPath);
    const prev = index.files[rel];

    if (!existsBaseline) {
      applyChange(rel, 'added', { info });
    } else if (!prev || prev.type !== info.type) {
      applyChange(rel, 'modified', { info });
    } else if (info.type === 'file' && prev.hash !== info.hash) {
      applyChange(rel, 'modified', { info });
    } else if (info.type === 'symlink' && prev.linkTarget !== info.linkTarget) {
      applyChange(rel, 'modified', { info });
    } else {
      return;
    }
    pendingUpdates.push({ rel, action: 'upsert', sandboxPath, baselinePath, info });
  };

  if (changeHint && !changeHint.fullScan) {
    for (const rel of changeHint.paths) {
      if (ignore(rel)) continue;
      await processChangePath(rel);
    }
    return { changes, index, pendingUpdates };
  }

  const sandboxFiles = await listSandboxFiles({ sandboxRoot, ignore });
  const seen = new Set();

  for (const [rel, entry] of sandboxFiles.entries()) {
    seen.add(rel);
    const sandboxPath = entry.full;
    const baselinePath = path.join(paths.baselineRoot, rel);

    const info = await getFileInfo(sandboxPath);
    const prev = index.files[rel];

    if (!prev) {
      applyChange(rel, 'added', { info });
      pendingUpdates.push({ rel, action: 'upsert', sandboxPath, baselinePath, info });
      continue;
    }

    if (prev.type !== info.type) {
      applyChange(rel, 'modified', { info });
      pendingUpdates.push({ rel, action: 'upsert', sandboxPath, baselinePath, info });
      continue;
    }

    if (info.type === 'file' && prev.hash !== info.hash) {
      applyChange(rel, 'modified', { info });
      pendingUpdates.push({ rel, action: 'upsert', sandboxPath, baselinePath, info });
      continue;
    }

    if (info.type === 'symlink' && prev.linkTarget !== info.linkTarget) {
      applyChange(rel, 'modified', { info });
      pendingUpdates.push({ rel, action: 'upsert', sandboxPath, baselinePath, info });
    }
  }

  for (const rel of Object.keys(index.files)) {
    if (seen.has(rel)) continue;
    const baselinePath = path.join(paths.baselineRoot, rel);
    applyChange(rel, 'deleted', {});
    pendingUpdates.push({ rel, action: 'delete', baselinePath });
  }

  return { changes, index, pendingUpdates };
}

async function enrichChangesWithDiff({ sandboxRoot, paths, changes, aiConfig }) {
  if (!aiConfig.verbose) return changes;

  const enriched = [];
  for (const change of changes) {
    if (change.info && change.info.type !== 'file') {
      enriched.push({ ...change, diff: null, reason: change.info.type });
      continue;
    }
    const sandboxPath = path.join(sandboxRoot, change.path);
    const baselinePath = path.join(paths.baselineRoot, change.path);
    const diffInfo = await computeDiffForChange({
      rel: change.path,
      type: change.type,
      sandboxPath,
      baselinePath,
      aiConfig
    });
    if (diffInfo) {
      enriched.push({ ...change, ...diffInfo });
    } else {
      enriched.push(change);
    }
  }
  return enriched;
}

async function applyBaselineUpdates({ index, pendingUpdates, paths }) {
  for (const update of pendingUpdates) {
    if (update.action === 'delete') {
      delete index.files[update.rel];
      await fs.rm(update.baselinePath, { force: true, recursive: true });
      continue;
    }
    if (update.action === 'upsert') {
      await updateBaselineFile(update);
      index.files[update.rel] = update.info;
    }
  }
  await writeBaselineIndex(paths, index);
}

async function appendJournal(paths, event) {
  await ensureDir(path.dirname(paths.journalPath));
  await fs.appendFile(paths.journalPath, `${JSON.stringify(event)}\n`);
}

async function writeContextMarkdown({ sandboxRoot, config, paths, lastRun, agent }) {
  await ensureDir(paths.root);
  const metaPath = path.join(sandboxRoot, '.livod', 'meta.json');
  const meta = await safeReadJson(metaPath, {});
  const intent = (await pathExists(paths.intentPath))
    ? await fs.readFile(paths.intentPath, 'utf8')
    : '';

  const lines = [];
  lines.push('# Livod AI Context');
  lines.push('');
  lines.push(`Sandbox: ${sandboxRoot}`);
  if (meta.sourceRoot) lines.push(`Source: ${meta.sourceRoot}`);
  if (agent) lines.push(`Agent: ${agent}`);
  lines.push('');
  lines.push('## Last Run');
  if (!lastRun) {
    lines.push('No runs recorded yet.');
  } else {
    lines.push(`Run ID: ${lastRun.runId}`);
    lines.push(`Status: ${lastRun.ok ? 'ok' : 'failed'}`);
    lines.push(`Duration: ${lastRun.durationMs}ms`);
    lines.push(`Timestamp: ${lastRun.timestamp}`);
    lines.push('');
    if (Array.isArray(lastRun.exits)) {
      lines.push('Commands:');
      for (const exit of lastRun.exits) {
        const status = exit.code === 0 ? 'ok' : `exit ${exit.code}`;
        lines.push(`- ${exit.name}: ${status}`);
      }
    }
    lines.push('');
    if (Array.isArray(lastRun.changes) && lastRun.changes.length) {
      lines.push('Changes:');
      for (const change of lastRun.changes) {
        lines.push(`- ${change.type}: ${change.path}`);
      }
    } else {
      lines.push('Changes: none');
    }
  }

  if (intent.trim().length) {
    lines.push('');
    lines.push('## Intent Notes');
    lines.push(intent.trim());
  }

  lines.push('');
  lines.push('## Config');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(config, null, 2));
  lines.push('```');
  lines.push('');

  await fs.writeFile(paths.contextPath, lines.join('\n'));
}

function renderCompactContext({ sandboxRoot, meta, lastRun, intent, agent, config, aiConfig }) {
  const lines = [];
  lines.push('# Livod Compact Context');
  lines.push('');
  lines.push(`Sandbox: ${sandboxRoot}`);
  if (meta.sourceRoot) lines.push(`Source: ${meta.sourceRoot}`);
  if (agent) lines.push(`Agent: ${agent}`);
  lines.push('');

  if (!lastRun) {
    lines.push('No runs recorded yet.');
    return lines.join('\n');
  }

  lines.push(`Last Run: ${lastRun.ok ? 'ok' : 'failed'} (${lastRun.durationMs}ms) @ ${lastRun.timestamp}`);
  if (Array.isArray(lastRun.exits)) {
    const failed = lastRun.exits.find((exit) => exit.code !== 0);
    if (failed) {
      lines.push(`Failed Command: ${failed.name} (exit ${failed.code})`);
    }
  }
  lines.push('');

  lines.push('Changes:');
  if (Array.isArray(lastRun.changes) && lastRun.changes.length) {
    for (const change of lastRun.changes) {
      lines.push(`- ${change.type}: ${change.path}`);
      if (change.diff && aiConfig.compact.enabled) {
        const snippet = headLines(change.diff, aiConfig.compact.maxDiffLines || 80);
        lines.push('```diff');
        lines.push(snippet);
        lines.push('```');
      }
    }
  } else {
    lines.push('- none');
  }

  if (lastRun.outputs) {
    lines.push('');
    lines.push('Outputs:');
    for (const [name, output] of Object.entries(lastRun.outputs)) {
      const stderr = tailLines(output.stderr || '', aiConfig.compact.maxStderrLines || 60);
      const stdout = tailLines(output.stdout || '', aiConfig.compact.maxStdoutLines || 20);
      if (stderr.trim()) {
        lines.push(`- ${name} stderr:`);
        lines.push('```');
        lines.push(stderr);
        lines.push('```');
      }
      if (!lastRun.ok && stdout.trim()) {
        lines.push(`- ${name} stdout:`);
        lines.push('```');
        lines.push(stdout);
        lines.push('```');
      }
    }
  }

  if (intent.trim().length) {
    lines.push('');
    lines.push('Intent Notes:');
    lines.push(intent.trim());
  }

  lines.push('');
  lines.push('Config (summary):');
  lines.push(`- parallel: ${config.parallel}`);
  lines.push(`- debounceMs: ${config.debounceMs}`);
  lines.push(`- restartOnChange: ${config.restartOnChange}`);
  lines.push(`- commands: ${(config.commands || []).map((cmd) => cmd.name).join(', ') || 'none'}`);

  return lines.join('\n');
}

async function writeCompactContext({ sandboxRoot, config, paths, lastRun, agent, aiConfig }) {
  await ensureDir(paths.root);
  const metaPath = path.join(sandboxRoot, '.livod', 'meta.json');
  const meta = await safeReadJson(metaPath, {});
  const intent = (await pathExists(paths.intentPath))
    ? await fs.readFile(paths.intentPath, 'utf8')
    : '';

  const content = renderCompactContext({ sandboxRoot, meta, lastRun, intent, agent, config, aiConfig });
  await fs.writeFile(paths.contextCompactPath, content);
}

async function initSession({ sandboxRoot, config, agent }) {
  const aiConfig = resolveAiConfig(config);
  if (!aiConfig.enabled) return { aiConfig, paths: aiPaths(sandboxRoot) };

  const paths = aiPaths(sandboxRoot);
  await ensureDir(paths.root);
  await ensureDir(path.dirname(paths.sessionPath));

  let session = await safeReadJson(paths.sessionPath, null);
  if (!session) {
    const metaPath = path.join(sandboxRoot, '.livod', 'meta.json');
    const meta = await safeReadJson(metaPath, {});
    session = {
      createdAt: nowIso(),
      sandboxRoot,
      sourceRoot: meta.sourceRoot || null,
      agent: agent || null,
      config
    };
    await writeJson(paths.sessionPath, session);
  }

  await ensureBaseline({ sandboxRoot, config, aiConfig, paths });

  return { aiConfig, paths };
}

function createOutputCapture(maxBytes) {
  const outputs = new Map();

  const append = ({ name, stream, line }) => {
    if (!outputs.has(name)) {
      outputs.set(name, { stdout: '', stderr: '', truncated: false });
    }
    const entry = outputs.get(name);
    const key = stream === 'stderr' ? 'stderr' : 'stdout';
    const withLine = entry[key] + line + '\n';
    if (withLine.length > maxBytes) {
      entry[key] = withLine.slice(withLine.length - maxBytes);
      entry.truncated = true;
    } else {
      entry[key] = withLine;
    }
  };

  const snapshot = () => {
    const result = {};
    for (const [name, value] of outputs.entries()) {
      result[name] = value;
    }
    return result;
  };

  const reset = () => {
    outputs.clear();
  };

  return { append, snapshot, reset };
}

async function recordRun({ sandboxRoot, config, agent, aiConfig, paths, run }) {
  if (!aiConfig.enabled) return null;

  const { changeHint } = run;
  const changeResult = await computeChanges({ sandboxRoot, config, aiConfig, paths, changeHint });
  const changes = await enrichChangesWithDiff({ sandboxRoot, paths, changes: changeResult.changes, aiConfig });
  await applyBaselineUpdates({
    index: changeResult.index,
    pendingUpdates: changeResult.pendingUpdates,
    paths
  });

  const event = {
    type: 'run',
    runId: run.runId,
    timestamp: nowIso(),
    agent: agent || null,
    ok: run.ok,
    interrupted: run.interrupted,
    durationMs: run.durationMs,
    exits: run.exits,
    changes
  };

  if (aiConfig.includeOutputs && run.outputs) {
    event.outputs = run.outputs;
  }

  if (aiConfig.journal) {
    await appendJournal(paths, event);
  }

  const lastRun = {
    runId: run.runId,
    timestamp: event.timestamp,
    agent: event.agent,
    ok: event.ok,
    interrupted: event.interrupted,
    durationMs: event.durationMs,
    exits: event.exits,
    changes: event.changes
  };

  if (aiConfig.includeOutputs && run.outputs) {
    lastRun.outputs = run.outputs;
  }

  await writeJson(paths.lastRunPath, lastRun);
  await writeContextMarkdown({ sandboxRoot, config, paths, lastRun, agent });
  if (aiConfig.compact && aiConfig.compact.enabled) {
    await writeCompactContext({ sandboxRoot, config, paths, lastRun, agent, aiConfig });
  }

  return event;
}

async function appendIntent({ sandboxRoot, config, agent, note }) {
  const aiConfig = resolveAiConfig(config);
  if (!aiConfig.enabled || !aiConfig.intentNotes) return null;
  const paths = aiPaths(sandboxRoot);
  await ensureDir(paths.root);
  await fs.appendFile(paths.intentPath, `${note}\n`);
  const event = {
    type: 'intent',
    timestamp: nowIso(),
    agent: agent || null,
    note
  };
  if (aiConfig.journal) {
    await appendJournal(paths, event);
  }
  return event;
}

async function exportContext({ sandboxRoot, config, agent, format }) {
  const aiConfig = resolveAiConfig(config);
  if (!aiConfig.enabled) return '';
  const paths = aiPaths(sandboxRoot);

  if (format === 'json') {
    const session = await safeReadJson(paths.sessionPath, {});
    const lastRun = await safeReadJson(paths.lastRunPath, {});
    const intent = (await pathExists(paths.intentPath))
      ? await fs.readFile(paths.intentPath, 'utf8')
      : '';
    const bundle = {
      session,
      lastRun,
      intent: intent.trim(),
      agent: agent || null
    };
    return JSON.stringify(bundle, null, 2);
  }

  const lastRun = await safeReadJson(paths.lastRunPath, null);
  if (format === 'compact') {
    await writeCompactContext({ sandboxRoot, config, paths, lastRun, agent, aiConfig });
    return await fs.readFile(paths.contextCompactPath, 'utf8');
  }

  await writeContextMarkdown({ sandboxRoot, config, paths, lastRun, agent });
  return await fs.readFile(paths.contextPath, 'utf8');
}

async function recordApply({ sandboxRoot, config, agent, targetRoot }) {
  const aiConfig = resolveAiConfig(config);
  if (!aiConfig.enabled || !aiConfig.journal) return null;
  const paths = aiPaths(sandboxRoot);
  const event = {
    type: 'apply',
    timestamp: nowIso(),
    agent: agent || null,
    targetRoot
  };
  await appendJournal(paths, event);
  return event;
}

module.exports = {
  resolveAiConfig,
  initSession,
  createOutputCapture,
  recordRun,
  appendIntent,
  exportContext,
  recordApply
};
