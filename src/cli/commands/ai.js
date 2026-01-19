const fs = require('fs/promises');
const { loadConfig } = require('../../core/config');
const { resolveSandboxPath } = require('../../core/sandbox');
const { exportContext } = require('../../core/ai');

async function aiCommand({ repoRoot, options, logger, agent }) {
  const { config } = await loadConfig(repoRoot, options);
  if (config.ai && config.ai.enabled === false) {
    logger.info('AI journaling is disabled. Enable it to export context.');
    return;
  }

  const sandboxRoot = await resolveSandboxPath(repoRoot, options.sandboxPath);
  if (!sandboxRoot) {
    throw new Error('No sandbox found. Run `livod start` first or pass --sandbox.');
  }

  const format = options.format || 'md';
  const output = await exportContext({ sandboxRoot, config, agent, format });

  if (options.outPath) {
    await fs.writeFile(options.outPath, output);
    logger.info(`Exported context to ${options.outPath}`);
  } else {
    process.stdout.write(output);
  }
}

module.exports = {
  aiCommand
};
