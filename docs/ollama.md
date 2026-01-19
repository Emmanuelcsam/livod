# Ollama Integration

Livod can use a local Ollama model to summarize builds and suggest changes.

## Requirements

- Ollama installed and running (`ollama serve`)
- A model pulled locally (e.g. `ollama pull llama3.2:3b`)

## Manual usage

```bash
livod ollama ask "Why did the build fail?"
```

To preview the prompt without running a model:

```bash
livod ollama prompt "Propose a fix"
```

## Auto mode

Enable auto summaries after each run:

```json
{
  "ollama": {
    "enabled": true,
    "auto": true,
    "context": "compact",
    "model": "llama3.2:3b"
  }
}
```

When auto mode runs, Livod writes:
- `.livod/ai/ollama/last_prompt.md`
- `.livod/ai/ollama/last_response.md`

Livod prefers the local API (`http://127.0.0.1:11434`) and falls back to the CLI if the API is unavailable.

## Making small models perform better

Livod helps small models by:
- emitting `context.compact.md`
- truncating long outputs to the most recent lines
- listing changes + diffs in minimal form

You can further improve results by:
- using `livod note` to explain intent
- keeping prompts task-focused
- limiting scope to one change at a time
