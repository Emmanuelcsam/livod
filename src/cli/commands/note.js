const { loadConfig } = require('../../core/config');
const { resolveSandboxPath } = require('../../core/sandbox');
const { appendIntent, exportContext } = require('../../core/ai');

async function noteCommand({ repoRoot, options, logger, agent, positionals }) {
  const text = positionals.join(' ').trim();
  if (!text) throw new Error('Note text required.');

  const { config } = await loadConfig(repoRoot, options);
  if (config.ai && config.ai.enabled === false) {
    logger.info('AI journaling is disabled. Enable it to add notes.');
    return;
  }

  const sandboxRoot = await resolveSandboxPath(repoRoot, options.sandboxPath);
  if (!sandboxRoot) {
    throw new Error('No sandbox found. Run `livod start` first or pass --sandbox.');
  }

  await appendIntent({ sandboxRoot, config, agent, note: text });
  await exportContext({ sandboxRoot, config, agent, format: 'md' });
  logger.info('Intent note added.');
}

module.exports = {
  noteCommand
};
