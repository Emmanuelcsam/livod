# Livod (Live Code)

Livod runs your project in a sandbox, rebuilds on every save, and keeps a machine-readable journal of every change. It's designed for humans *and* coding agents: every run captures what changed, what ran, and what happened.

## Why Livod

- **Live feedback loop**: edit in one terminal, watch builds/tests in another.
- **Safe sandbox**: changes happen in a temporary copy first.
- **AI-friendly journal**: per-run diffs, outputs, and intent notes.
- **Ollama integration**: feed compact context to local models to improve results.

## Quick start

```bash
npm install

# from the repo you want to work on
node /path/to/livod/src/cli/index.js start
```

Open the printed sandbox path in your editor and make changes there. Livod will rebuild on every save.

When you're satisfied and the last run is green:

```bash
node /path/to/livod/src/cli/index.js apply
```

If you want a shorter command:

```bash
npm link
livod start
```

## Documentation

- `docs/cli.md` - full CLI reference
- `docs/config.md` - config reference and defaults
- `docs/ai-journal.md` - journal files and event formats
- `docs/ollama.md` - Ollama integration and prompt strategy
- `docs/architecture.md` - internals and data flow
- `AGENTS.md` - instructions for other coding agents

## Core commands (short list)

- `livod start` - create a sandbox, start watcher, run commands on each change
- `livod apply` - sync sandbox changes back to the original repo
- `livod ai` - print AI context (full)
- `livod export --format compact` - compact context for small models
- `livod note "..."` - append intent notes
- `livod ollama ask "..."` - ask a local model using current context

## AI journaling (what it captures)

Inside the sandbox:

- `.livod/ai/session.json` - session metadata
- `.livod/ai/changes.ndjson` - append-only events per run
- `.livod/ai/last_run.json` - last run summary
- `.livod/ai/context.md` - full context
- `.livod/ai/context.compact.md` - compressed context for small models
- `.livod/ai/intent.md` - intent notes

## Ollama integration

Livod can feed a compact prompt to a local model:

```bash
livod ollama ask "Why did the build fail?"
```

Enable auto-summaries after every run:

```json
{
  "ollama": {
    "enabled": true,
    "auto": true,
    "model": "llama3.2:3b",
    "context": "compact"
  }
}
```

## License

MIT
