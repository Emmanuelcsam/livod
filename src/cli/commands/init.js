const { writeSampleConfig } = require('../../core/config');

async function initCommand({ repoRoot, logger }) {
  const result = await writeSampleConfig(repoRoot);
  if (result.created) {
    logger.info(`Created ${result.path}`);
  } else {
    logger.info(`Config already exists at ${result.path}`);
  }
}

module.exports = {
  initCommand
};
