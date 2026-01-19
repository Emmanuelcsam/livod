# Guidance for Coding Agents

Livod is designed to give you a reliable, structured context when you make code changes.

## Recommended workflow

1. Run `livod start` in the target repo.
2. Open the sandbox path and edit **only** inside the sandbox.
3. After each change, read:
   - `.livod/ai/context.compact.md` for a quick view
   - `.livod/ai/last_run.json` for structured data
4. Use `livod note "..."` to record intent before large edits.
5. When the run is green, apply with `livod apply`.

## Files you should read

- `.livod/ai/context.compact.md` - best for small models
- `.livod/ai/context.md` - full context
- `.livod/ai/changes.ndjson` - full history of runs

## Expected agent behavior

- Keep changes minimal and reversible.
- Use intent notes to explain non-obvious decisions.
- If a run fails, fix *one* thing at a time.
- Prefer `last_run.json` for accurate exit codes and timings.

## Suggested prompt template

You can use this template when calling a model:

```
You are a coding agent working in a Livod sandbox.
Read the compact context and propose the smallest change to fix failures.
If you are unsure, ask a clarifying question before editing.

[PASTE context.compact.md HERE]
```
