const { loadConfig } = require('../../core/config');
const { resolveSandboxPath } = require('../../core/sandbox');
const { readLastRunDiff } = require('../../core/ai');

async function diffCommand({ repoRoot, options, logger }) {
  const { config } = await loadConfig(repoRoot, options);
  if (config.ai && config.ai.enabled === false) {
    logger.warn('AI journaling is disabled; no diffs available.');
    return;
  }

  const sandboxRoot = await resolveSandboxPath(repoRoot, options.sandboxPath);
  if (!sandboxRoot) {
    throw new Error('No sandbox found. Run `livod start` first or pass --sandbox.');
  }

  const result = await readLastRunDiff({ sandboxRoot, config });
  if (!result || !result.patch) {
    logger.warn(result && result.reason ? result.reason : 'No diff available.');
    return;
  }

  process.stdout.write(result.patch);
}

module.exports = {
  diffCommand
};
