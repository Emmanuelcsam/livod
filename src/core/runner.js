const path = require('path');
const { spawn } = require('child_process');
const chokidar = require('chokidar');
const { makeIgnoreMatcher, writeJson, ensureDir } = require('../shared/fs');
const { createOutputCapture, recordRun, resolveAiConfig } = require('./ai');
const { formatDuration } = require('../shared/text');
const { createLogger } = require('../shared/log');
const { maybeRunOllamaAuto } = require('../integrations/ollama');

function prefixStream(stream, prefix, sink, onLine) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      if (line.length) {
        sink(`${prefix}${line}`);
        if (onLine) onLine(line);
      }
    }
  });
  stream.on('end', () => {
    if (buffer.length) {
      sink(`${prefix}${buffer}`);
      if (onLine) onLine(buffer);
    }
  });
}

function spawnCommand(command, sandboxRoot, env, onLine, logger) {
  const cwd = command.cwd ? path.join(sandboxRoot, command.cwd) : sandboxRoot;
  const child = spawn(command.cmd, {
    shell: true,
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const prefix = `[${command.name}] `;
  if (child.stdout) {
    prefixStream(child.stdout, prefix, (line) => logger.line(line), (line) => {
      if (onLine) onLine({ name: command.name, stream: 'stdout', line });
    });
  }
  if (child.stderr) {
    prefixStream(child.stderr, prefix, (line) => logger.lineError(line), (line) => {
      if (onLine) onLine({ name: command.name, stream: 'stderr', line });
    });
  }

  const exitPromise = new Promise((resolve) => {
    child.on('exit', (code, signal) => resolve({ name: command.name, code, signal }));
  });

  return { child, exitPromise };
}

function createRunner({ sandboxRoot, config, aiContext, agent, getChangeHint, logger }) {
  let running = false;
  let pending = false;
  let runCount = 0;
  let currentChildren = [];
  let interrupted = false;

  const statusPath = path.join(sandboxRoot, '.livod', 'status.json');
  const aiConfig = resolveAiConfig(config);
  const outputCapture = aiConfig.enabled && aiConfig.includeOutputs
    ? createOutputCapture(aiConfig.maxOutputBytes)
    : null;

  async function writeStatus(status) {
    await ensureDir(path.dirname(statusPath));
    await writeJson(statusPath, status);
  }

  async function stopCurrentRun() {
    if (!currentChildren.length) return;
    interrupted = true;
    currentChildren.forEach(({ child }) => {
      if (!child.killed) child.kill('SIGTERM');
    });
    setTimeout(() => {
      currentChildren.forEach(({ child }) => {
        if (!child.killed) child.kill('SIGKILL');
      });
    }, 2000).unref();
  }

  async function runCommands() {
    running = true;
    interrupted = false;
    runCount += 1;

    const runId = runCount;
    const startedAt = Date.now();
    logger.info(`Run #${runId} started.`);

    const env = { ...process.env, LIVOD: '1', LIVOD_SANDBOX: sandboxRoot };

    const results = [];
    currentChildren = [];
    if (outputCapture) outputCapture.reset();
    const changeHint = getChangeHint ? getChangeHint() : null;

    if (config.parallel) {
      for (const command of config.commands) {
        const spawned = spawnCommand(command, sandboxRoot, env, outputCapture ? outputCapture.append : null, logger);
        currentChildren.push(spawned);
        results.push(spawned.exitPromise);
      }
      const exits = await Promise.all(results);
      const durationMs = Date.now() - startedAt;
      const ok = exits.every((exit) => exit.code === 0);
      await writeStatus({
        lastRunAt: new Date().toISOString(),
        lastRunOk: ok,
        interrupted,
        durationMs,
        exits
      });
      logger.info(`Run #${runId} ${ok ? 'succeeded' : 'failed'} in ${formatDuration(durationMs)}.`);

      if (aiContext && aiConfig.enabled) {
        const event = await recordRun({
          sandboxRoot,
          config,
          agent,
          aiConfig,
          paths: aiContext.paths,
          run: {
            runId,
            ok,
            interrupted,
            durationMs,
            exits,
            outputs: outputCapture ? outputCapture.snapshot() : null,
            changeHint
          }
        });
        try {
          await maybeRunOllamaAuto({
            sandboxRoot,
            config,
            agent,
            aiContext,
            run: event,
            logger
          });
        } catch (err) {
          logger.warn(`Ollama auto-run failed: ${err.message}`);
        }
      }
    } else {
      const exits = [];
      for (const command of config.commands) {
        const spawned = spawnCommand(command, sandboxRoot, env, outputCapture ? outputCapture.append : null, logger);
        currentChildren = [spawned];
        const exit = await spawned.exitPromise;
        exits.push(exit);
        if (exit.code !== 0) break;
      }
      const durationMs = Date.now() - startedAt;
      const ok = exits.every((exit) => exit.code === 0);
      await writeStatus({
        lastRunAt: new Date().toISOString(),
        lastRunOk: ok,
        interrupted,
        durationMs,
        exits
      });
      logger.info(`Run #${runId} ${ok ? 'succeeded' : 'failed'} in ${formatDuration(durationMs)}.`);

      if (aiContext && aiConfig.enabled) {
        const event = await recordRun({
          sandboxRoot,
          config,
          agent,
          aiConfig,
          paths: aiContext.paths,
          run: {
            runId,
            ok,
            interrupted,
            durationMs,
            exits,
            outputs: outputCapture ? outputCapture.snapshot() : null,
            changeHint
          }
        });
        try {
          await maybeRunOllamaAuto({
            sandboxRoot,
            config,
            agent,
            aiContext,
            run: event,
            logger
          });
        } catch (err) {
          logger.warn(`Ollama auto-run failed: ${err.message}`);
        }
      }
    }

    running = false;
    currentChildren = [];

    if (pending) {
      pending = false;
      await runCommands();
    }
  }

  async function requestRun({ immediate = false } = {}) {
    if (running) {
      pending = true;
      if (config.restartOnChange) {
        await stopCurrentRun();
      }
      return;
    }

    if (immediate) {
      await runCommands();
      return;
    }

    await runCommands();
  }

  return { requestRun, stopCurrentRun };
}

function startWatcher({ sandboxRoot, config, aiContext, agent, logger }) {
  const log = logger || createLogger({ debug: process.env.LIVOD_DEBUG === '1' });
  const ignoreMatcher = makeIgnoreMatcher(config.ignore || []);
  const allowDirScan = !(config.ai && config.ai.scanAllOnDirChange === false);
  const ignored = (watchPath) => {
    const rel = path.isAbsolute(watchPath)
      ? path.relative(sandboxRoot, watchPath)
      : watchPath;
    if (!rel || rel === '' || rel.startsWith('..')) return false;
    if (rel === '.livod' || rel.startsWith(`.livod${path.sep}`)) return true;
    return ignoreMatcher(rel);
  };

  let pendingFullScan = false;
  const pendingChanges = new Set();

  const getChangeHint = () => {
    const paths = Array.from(pendingChanges);
    pendingChanges.clear();
    const fullScan = pendingFullScan;
    pendingFullScan = false;
    return { paths, fullScan };
  };

  const runner = createRunner({ sandboxRoot, config, aiContext, agent, getChangeHint, logger: log });

  let debounceTimer = null;
  const triggerRun = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      runner.requestRun();
    }, config.debounceMs || 0);
  };

  const watcher = chokidar.watch(config.watch, {
    cwd: sandboxRoot,
    ignored,
    ignoreInitial: true,
    persistent: true
  });

  const recordChange = (targetPath, type) => {
    const rel = path.isAbsolute(targetPath)
      ? path.relative(sandboxRoot, targetPath)
      : targetPath;
    if (!rel || rel === '' || rel.startsWith('..')) return;
    if (type === 'dir') {
      if (!allowDirScan) {
        triggerRun();
        return;
      }
      pendingFullScan = true;
    } else {
      pendingChanges.add(rel);
    }
    triggerRun();
  };

  watcher.on('add', (filePath) => recordChange(filePath, 'file'));
  watcher.on('change', (filePath) => recordChange(filePath, 'file'));
  watcher.on('unlink', (filePath) => recordChange(filePath, 'file'));
  watcher.on('addDir', (dirPath) => recordChange(dirPath, 'dir'));
  watcher.on('unlinkDir', (dirPath) => recordChange(dirPath, 'dir'));

  watcher.on('ready', async () => {
    log.info(`Watching sandbox: ${sandboxRoot}`);
    await runner.requestRun({ immediate: true });
  });

  const shutdown = async () => {
    await runner.stopCurrentRun();
    await watcher.close();
  };

  process.on('SIGINT', async () => {
    log.info('Shutting down...');
    await shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    log.info('Shutting down...');
    await shutdown();
    process.exit(0);
  });

  return { watcher, runner };
}

module.exports = {
  startWatcher
};
