# CLI Reference

## Commands

### `livod start`
Creates a sandbox, starts the watcher, and runs commands on every change.

Common options:
- `--config <path>`
- `--sandbox <path>`
- `--debounce <ms>`
- `--no-parallel`
- `--no-restart`
- `--no-link-node-modules`
- `--no-ai`
- `--agent <name>`
- `--ollama` (enable Ollama auto mode)
- `--ollama-auto`
- `--ollama-auto-success`

### `livod apply`
Applies sandbox changes back to the original repo.

Options:
- `--sandbox <path>`
- `--prune` (remove files deleted in the sandbox)
- `--force` (apply even if last run failed)

### `livod ai`
Prints AI context to stdout (defaults to full markdown).

Options:
- `--format md|compact|json`
- `--out <path>`
- `--watch` (stream updates after each run)

### `livod export`
Alias of `livod ai`.

### `livod note <text>`
Appends an intent note for the AI journal.

### `livod diff`
Prints a clean patch for the last run.

### `livod ollama [ask|prompt|check] [question]`
Runs a local Ollama model using the current context.

Examples:
```bash
livod ollama ask "Summarize the failure"
livod ollama prompt "Propose a fix"
livod ollama check
```

Ollama options:
- `--ollama-model <name>`
- `--ollama-context <md|compact|json>`
- `--ollama-temp <float>`
- `--ollama-system <text>`

### `livod init`
Creates a starter `livod.config.json`.

### `livod clean`
Deletes `.livod/sandboxes` (keeps config).
