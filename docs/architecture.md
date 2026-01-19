# Architecture

## Overview

Livod runs a sandbox copy of a repo, watches changes, executes configured commands, and records AI-friendly artifacts.

### Core flow

1. `start` creates a sandbox and copies files.
2. Watcher listens for filesystem changes.
3. On change, commands run (parallel or sequential).
4. AI journal captures diffs and outputs.
5. `apply` syncs sandbox back to repo when desired.

## Modules

- `src/core/config.js` - load/merge config, defaults
- `src/core/sandbox.js` - sandbox creation + state
- `src/core/runner.js` - watcher + process runner
- `src/core/ai.js` - journal + context generation
- `src/core/apply.js` - sandbox apply back to repo
- `src/integrations/ollama.js` - Ollama prompt + execution
- `src/cli/*` - CLI routing and commands
- `src/shared/*` - shared utilities

## Data layout

Sandbox `.livod/`:
- `state.json` - last sandbox path
- `ai/` - journal, context, and Ollama artifacts
- `ai/baseline/` - baseline snapshot for diffs

## Extending

- Add new integrations under `src/integrations/`
- Add new CLI commands in `src/cli/commands/`
- Keep `core` modules small and unit-testable
