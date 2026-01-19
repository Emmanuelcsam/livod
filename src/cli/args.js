function parseArgs(argv) {
  const args = [...argv];
  const options = {};
  const positionals = [];
  let command = null;
  let subcommand = null;
  let passthrough = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--') {
      passthrough = true;
      continue;
    }

    if (!command && !arg.startsWith('-')) {
      command = arg;
      continue;
    }

    if (command === 'ollama' && !subcommand && !arg.startsWith('-')) {
      if (['ask', 'prompt', 'check'].includes(arg)) {
        subcommand = arg;
        continue;
      }
    }

    if (passthrough || !arg.startsWith('-')) {
      positionals.push(arg);
      continue;
    }

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    switch (arg) {
      case '--config':
        options.configPath = args[i + 1];
        i += 1;
        break;
      case '--sandbox':
        options.sandboxPath = args[i + 1];
        i += 1;
        break;
      case '--debounce':
        options.debounceMs = Number(args[i + 1]);
        i += 1;
        break;
      case '--no-parallel':
        options.parallel = false;
        break;
      case '--no-restart':
        options.restartOnChange = false;
        break;
      case '--no-link-node-modules':
        options.linkNodeModules = false;
        break;
      case '--no-ai':
        options.aiEnabled = false;
        break;
      case '--agent':
        options.agent = args[i + 1];
        i += 1;
        break;
      case '--format':
        options.format = args[i + 1];
        i += 1;
        break;
      case '--watch':
        options.watch = true;
        break;
      case '--out':
        options.outPath = args[i + 1];
        i += 1;
        break;
      case '--prune':
        options.pruneOnApply = true;
        break;
      case '--force':
        options.applyRequiresSuccess = false;
        break;
      case '--ollama':
        options.ollamaEnabled = true;
        break;
      case '--no-ollama':
        options.ollamaEnabled = false;
        break;
      case '--ollama-model':
        options.ollamaModel = args[i + 1];
        options.ollamaEnabled = true;
        i += 1;
        break;
      case '--ollama-auto':
        options.ollamaAuto = true;
        options.ollamaEnabled = true;
        break;
      case '--ollama-auto-success':
        options.ollamaAutoOnSuccessOnly = true;
        options.ollamaEnabled = true;
        break;
      case '--ollama-context':
        options.ollamaContext = args[i + 1];
        options.ollamaEnabled = true;
        i += 1;
        break;
      case '--ollama-temp':
        options.ollamaTemperature = Number(args[i + 1]);
        options.ollamaEnabled = true;
        i += 1;
        break;
      case '--ollama-system':
        options.ollamaSystemPrompt = args[i + 1];
        options.ollamaEnabled = true;
        i += 1;
        break;
      default:
        options.unknown = arg;
        break;
    }
  }

  return {
    command: command || 'start',
    subcommand,
    options,
    positionals
  };
}

module.exports = {
  parseArgs
};
