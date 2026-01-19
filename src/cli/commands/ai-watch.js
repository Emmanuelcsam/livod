const fs = require('fs/promises');
const path = require('path');
const chokidar = require('chokidar');
const { loadConfig } = require('../../core/config');
const { resolveSandboxPath } = require('../../core/sandbox');
const { exportContext } = require('../../core/ai');

async function aiWatchCommand({ repoRoot, options, logger, agent }) {
  const { config } = await loadConfig(repoRoot, options);
  if (config.ai && config.ai.enabled === false) {
    logger.info('AI journaling is disabled. Enable it to watch context.');
    return;
  }

  const sandboxRoot = await resolveSandboxPath(repoRoot, options.sandboxPath);
  if (!sandboxRoot) {
    throw new Error('No sandbox found. Run `livod start` first or pass --sandbox.');
  }

  const format = options.format || 'md';
  const lastRunPath = path.join(sandboxRoot, '.livod', 'ai', 'last_run.json');

  let lastSignature = null;

  const emitContext = async () => {
    try {
      const raw = await fs.readFile(lastRunPath, 'utf8');
      if (raw === lastSignature) return;
      lastSignature = raw;
    } catch {
      // ignore missing file
    }

    const output = await exportContext({ sandboxRoot, config, agent, format });
    process.stdout.write(`\n--- livod ai (${format}) @ ${new Date().toISOString()} ---\n`);
    process.stdout.write(output);
    process.stdout.write('\n');
  };

  await emitContext();

  const watcher = chokidar.watch(lastRunPath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
  });

  watcher.on('change', emitContext);
  watcher.on('add', emitContext);

  const shutdown = async () => {
    await watcher.close();
  };

  process.on('SIGINT', async () => {
    logger.info('Stopping ai watch...');
    await shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Stopping ai watch...');
    await shutdown();
    process.exit(0);
  });

  logger.info(`Watching AI context (${format}) at ${lastRunPath}`);
}

module.exports = {
  aiWatchCommand
};
