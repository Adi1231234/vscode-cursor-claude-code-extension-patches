# Worktree sessions in history

**Type:** bug fix
**Touches:** `extension.js`
**Guard marker:** `dir:this.cwd,includeWorktrees:!0`

The history-list handler hardcodes `includeWorktrees:!1`. Flips it to `!0` so `/resume` and the history panel list sessions from every worktree of the repo. Anchored on non-minified keys.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting anything.
