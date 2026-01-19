const { cleanSandboxes } = require('../../core/sandbox');

async function cleanCommand({ repoRoot, logger }) {
  await cleanSandboxes(repoRoot);
  logger.info('Removed sandboxes.');
}

module.exports = {
  cleanCommand
};
