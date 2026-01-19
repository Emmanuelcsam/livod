#!/usr/bin/env node

const { parseArgs } = require('./args');
const { printHelp } = require('./help');
const { createLogger } = require('../shared/log');
const { startCommand } = require('./commands/start');
const { applyCommand } = require('./commands/apply');
const { initCommand } = require('./commands/init');
const { cleanCommand } = require('./commands/clean');
const { aiCommand } = require('./commands/ai');
const { noteCommand } = require('./commands/note');
const { ollamaCommand } = require('./commands/ollama');

async function main() {
  const { command, subcommand, options, positionals } = parseArgs(process.argv.slice(2));

  if (options.help || command === 'help') {
    printHelp();
    return;
  }

  if (options.unknown) {
    throw new Error(`Unknown option: ${options.unknown}`);
  }

  const repoRoot = process.cwd();
  const agent = options.agent || process.env.LIVOD_AGENT || null;
  const logger = createLogger({ debug: process.env.LIVOD_DEBUG === '1' });

  switch (command) {
    case 'start':
      await startCommand({ repoRoot, options, logger, agent, positionals });
      return;
    case 'apply':
      await applyCommand({ repoRoot, options, logger, agent, positionals });
      return;
    case 'ai':
    case 'export':
      await aiCommand({ repoRoot, options, logger, agent, positionals });
      return;
    case 'note':
      await noteCommand({ repoRoot, options, logger, agent, positionals });
      return;
    case 'init':
      await initCommand({ repoRoot, options, logger, agent, positionals });
      return;
    case 'clean':
      await cleanCommand({ repoRoot, options, logger, agent, positionals });
      return;
    case 'ollama':
      await ollamaCommand({ repoRoot, options, logger, agent, positionals, subcommand });
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((err) => {
  process.stderr.write(`[livod] Error: ${err.message}\n`);
  process.exit(1);
});
