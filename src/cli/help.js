const HELP_TEXT = `
Livod (Live Code)

Usage:
  livod start [options]
  livod apply [options]
  livod ai [options]
  livod ai --watch [options]
  livod export [options]
  livod note <text> [options]
  livod diff [options]
  livod ollama [ask|prompt|check] [options] [question]
  livod init
  livod clean

Core options:
  --config <path>             Use a specific config file
  --sandbox <path>            Use or create a sandbox at this path
  --debounce <ms>             Debounce file changes
  --no-parallel               Run commands sequentially
  --no-restart                Do not restart commands on change
  --no-link-node-modules      Do not symlink node_modules into sandbox
  --no-ai                     Disable AI journaling
  --agent <name>              Tag events with an agent name

Apply options:
  --prune                     Delete files in repo that were removed in sandbox
  --force                     Apply even if last run failed

AI export options:
  --format <md|compact|json>   Output format for ai/export
  --out <path>                Write export output to a file

Ollama options:
  --ollama                    Enable Ollama integration
  --no-ollama                 Disable Ollama integration
  --ollama-model <name>       Model name (default from config)
  --ollama-auto               Auto-run Ollama after each build
  --ollama-auto-success       Auto-run only on success
  --ollama-context <format>   Context format: md|compact|json
  --ollama-temp <float>       Temperature for API mode
  --ollama-system <text>      System prompt override

General:
  -h, --help                  Show help
`;

function printHelp() {
  process.stdout.write(HELP_TEXT.trimStart());
}

module.exports = {
  printHelp
};
