const { loadConfig } = require('../../core/config');
const { resolveSandboxPath } = require('../../core/sandbox');
const { applySandbox } = require('../../core/apply');
const { recordApply } = require('../../core/ai');

async function applyCommand({ repoRoot, options, logger, agent }) {
  const { config } = await loadConfig(repoRoot, options);
  const sandboxRoot = await resolveSandboxPath(repoRoot, options.sandboxPath);
  if (!sandboxRoot) {
    throw new Error('No sandbox found. Run `livod start` first or pass --sandbox.');
  }

  const requireSuccess = options.applyRequiresSuccess !== false && config.applyRequiresSuccess !== false;
  const prune = options.pruneOnApply === true || config.pruneOnApply === true;

  const result = await applySandbox({
    sandboxRoot,
    repoRoot,
    config,
    requireSuccess,
    prune
  });

  await recordApply({ sandboxRoot, config, agent, targetRoot: result.targetRoot });
  logger.info(`Applied sandbox changes to ${result.targetRoot}`);
}

module.exports = {
  applyCommand
};
