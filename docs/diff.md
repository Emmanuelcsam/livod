# Diff Output

`livod diff` prints a clean patch for the **last run** in the sandbox.

Usage:

```bash
livod diff
```

Notes:
- Diffs come from the AI journal (`last_run.json`).
- If `ai.verbose` is disabled, diffs may not be available.
- For the most precise diffs, leave `ai.verbose` enabled.
