# AI Journal

Livod writes a structured journal per sandbox in `.livod/ai/`.

## Files

- `session.json` - session metadata (createdAt, sandboxRoot, sourceRoot, config)
- `changes.ndjson` - append-only events (runs, intent notes, applies)
- `last_run.json` - summary of the latest run
- `context.md` - full AI context (human readable)
- `context.compact.md` - condensed context for small models
- `intent.md` - free-form intent notes

## Event shape (`changes.ndjson`)

Each line is JSON. Example run event:

```json
{
  "type": "run",
  "runId": 2,
  "timestamp": "2026-01-19T13:36:09.071Z",
  "agent": "codex",
  "ok": true,
  "interrupted": false,
  "durationMs": 166,
  "exits": [{"name": "build", "code": 0, "signal": null}],
  "changes": [
    {
      "path": "build.js",
      "type": "modified",
      "diff": "...",
      "truncated": false
    }
  ],
  "outputs": {
    "build": {"stdout": "...", "stderr": "...", "truncated": false}
  }
}
```

Intent event:

```json
{
  "type": "intent",
  "timestamp": "...",
  "agent": "codex",
  "note": "Refactor parser for streaming input"
}
```

Apply event:

```json
{
  "type": "apply",
  "timestamp": "...",
  "agent": "codex",
  "targetRoot": "/path/to/repo"
}
```

## Tips for agents

- Prefer `context.compact.md` for small models.
- Use `last_run.json` for deterministic parsing.
- Diff patches are truncated; request full file if needed.
