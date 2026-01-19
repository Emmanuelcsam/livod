const path = require('path');
const { loadConfig } = require('../../core/config');
const { createSandbox } = require('../../core/sandbox');
const { startWatcher } = require('../../core/runner');
const { initSession } = require('../../core/ai');
const { pathExists } = require('../../shared/fs');

async function startCommand({ repoRoot, options, logger, agent }) {
  const { config, configSource } = await loadConfig(repoRoot, options);

  let sandboxRoot = null;
  if (options.sandboxPath) {
    const resolved = path.resolve(repoRoot, options.sandboxPath);
    if (await pathExists(resolved)) {
      sandboxRoot = resolved;
    }
  }

  if (!sandboxRoot) {
    sandboxRoot = await createSandbox({
      repoRoot,
      config,
      sandboxPath: options.sandboxPath
    });
  }

  let aiContext = null;
  if (config.ai && config.ai.enabled) {
    aiContext = await initSession({ sandboxRoot, config, agent });
  }

  if (configSource) {
    logger.info(`Using config: ${configSource}`);
  } else {
    logger.info('Using default config.');
  }

  logger.info(`Sandbox ready at ${sandboxRoot}`);
  logger.info('Open the sandbox in another terminal/editor to edit.');

  startWatcher({ sandboxRoot, config, aiContext, agent, logger });
}

module.exports = {
  startCommand
};
