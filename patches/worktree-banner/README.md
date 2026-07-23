# Worktree banner

**Type:** feature
**Touches:** `webview/index.css`
**Guard marker:** `/* WORKTREE */`

Shrinks the verbose worktree banner to a compact `worktree: NAME`. Appends `worktree.css`.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting anything.
