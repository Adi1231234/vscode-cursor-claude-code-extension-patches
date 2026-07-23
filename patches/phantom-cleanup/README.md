# Phantom title cleanup

**Type:** data fix
**Touches:** `~/.claude/projects (deletes files)`
**Guard marker:** `(runtime, via cleanup.js)`

Deletes the title-only phantom session files the title-dir bug already left on disk - but only when a real, larger transcript for the same id exists elsewhere. Never touches a file without a content twin. Safe + idempotent. Runs `cleanup.js` via node (dry-run then apply).

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting anything.
