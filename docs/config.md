# Configuration

Livod reads configuration from one of:
- `livod.config.json`
- `.livodrc.json`
- `package.json` under `livod` key

## Full example

```json
{
  "watch": ["**/*"],
  "ignore": ["node_modules/**", ".git/**", ".livod/**"],
  "commands": [
    { "name": "build", "cmd": "npm run build" }
  ],
  "debounceMs": 250,
  "parallel": true,
  "restartOnChange": true,
  "linkNodeModules": true,
  "applyRequiresSuccess": true,
  "pruneOnApply": false,
  "ai": {
    "enabled": true,
    "verbose": true,
    "journal": true,
    "includeOutputs": true,
    "maxFileBytes": 524288,
    "maxDiffBytes": 131072,
    "maxOutputBytes": 32768,
    "baseline": true,
    "intentNotes": true,
    "scanAllOnDirChange": true,
    "compact": {
      "enabled": true,
      "maxDiffLines": 80,
      "maxStdoutLines": 20,
      "maxStderrLines": 60
    }
  },
  "ollama": {
    "enabled": false,
    "model": "llama3.2:3b",
    "temperature": 0.2,
    "systemPrompt": "You are a helpful coding assistant...",
    "auto": false,
    "autoOnSuccessOnly": false,
    "context": "compact",
    "maxPromptChars": 20000
  }
}
```

## Fields

### `watch`
Glob patterns to watch in the sandbox.

### `ignore`
Glob patterns ignored in sandbox copy and watch.

### `commands`
Array of commands to run on each change. Each command can be:
- string: `"npm run build"`
- object: `{ "name": "build", "cmd": "npm run build", "cwd": "./subdir" }`

### `debounceMs`
Milliseconds to debounce change events.

### `parallel`
Run commands in parallel (true) or sequentially (false).

### `restartOnChange`
If true, running commands are terminated and restarted on edits.

### `linkNodeModules`
Symlink `node_modules` into the sandbox if present.

### `applyRequiresSuccess`
If true, `livod apply` refuses when last run failed.

### `pruneOnApply`
If true, delete files in the repo that were removed in the sandbox.

### `ai`
Controls the change journal and context generation.

### `ollama`
Local LLM integration using the `ollama` CLI or API.

## JSON schema

See `schemas/livod.config.schema.json`.
