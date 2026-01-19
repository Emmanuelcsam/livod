const path = require('path');
const fs = require('fs/promises');
const {
  ensureDir,
  copyDir,
  makeIgnoreMatcher,
  pathExists,
  writeJson,
  readJson,
  removeDir
} = require('../shared/fs');

function sandboxId() {
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${rand}`;
}

function stateFile(repoRoot) {
  return path.join(repoRoot, '.livod', 'state.json');
}

async function updateState(repoRoot, sandboxRoot) {
  const statePath = stateFile(repoRoot);
  let state = { lastSandbox: sandboxRoot, sandboxes: [sandboxRoot] };
  if (await pathExists(statePath)) {
    try {
      const existing = await readJson(statePath);
      const sandboxes = Array.isArray(existing.sandboxes) ? existing.sandboxes : [];
      if (!sandboxes.includes(sandboxRoot)) sandboxes.push(sandboxRoot);
      state = { ...existing, lastSandbox: sandboxRoot, sandboxes };
    } catch {
      // ignore invalid state
    }
  }
  await writeJson(statePath, state);
}

async function createSandbox({ repoRoot, config, sandboxPath }) {
  const livodRoot = path.join(repoRoot, '.livod');
  await ensureDir(livodRoot);

  const sandboxRoot = sandboxPath
    ? path.resolve(repoRoot, sandboxPath)
    : path.join(livodRoot, 'sandboxes', sandboxId());

  if (!(await pathExists(sandboxRoot))) {
    await ensureDir(sandboxRoot);
  }

  const ignoreMatcher = makeIgnoreMatcher(config.ignore || []);
  const shouldIgnore = (rel) => {
    if (rel === '.livod' || rel.startsWith(`.livod${path.sep}`)) return true;
    return ignoreMatcher(rel);
  };

  await copyDir(repoRoot, sandboxRoot, shouldIgnore);

  const sandboxLivod = path.join(sandboxRoot, '.livod');
  await ensureDir(sandboxLivod);

  if (config.linkNodeModules) {
    const srcModules = path.join(repoRoot, 'node_modules');
    const destModules = path.join(sandboxRoot, 'node_modules');
    if (await pathExists(srcModules)) {
      if (!(await pathExists(destModules))) {
        await fs.symlink(srcModules, destModules, 'junction');
      }
    }
  }

  const meta = {
    sourceRoot: repoRoot,
    sandboxRoot,
    createdAt: new Date().toISOString(),
    config
  };
  await writeJson(path.join(sandboxLivod, 'meta.json'), meta);
  await updateState(repoRoot, sandboxRoot);

  return sandboxRoot;
}

async function resolveSandboxPath(repoRoot, explicitPath) {
  if (explicitPath) return path.resolve(repoRoot, explicitPath);
  const statePath = stateFile(repoRoot);
  if (!(await pathExists(statePath))) return null;
  try {
    const state = await readJson(statePath);
    if (state && state.lastSandbox) return state.lastSandbox;
  } catch {
    return null;
  }
  return null;
}

async function readSandboxMeta(sandboxRoot) {
  const metaPath = path.join(sandboxRoot, '.livod', 'meta.json');
  if (!(await pathExists(metaPath))) return null;
  try {
    return await readJson(metaPath);
  } catch {
    return null;
  }
}

async function cleanSandboxes(repoRoot) {
  const sandboxesRoot = path.join(repoRoot, '.livod', 'sandboxes');
  await removeDir(sandboxesRoot);
}

module.exports = {
  createSandbox,
  resolveSandboxPath,
  readSandboxMeta,
  cleanSandboxes
};
