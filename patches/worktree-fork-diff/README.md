# Worktree fork/diff

**Type:** bug fix
**Touches:** `extension.js`
**Guard marker:** `/* WTFORKFIX */`

`fork` / inline-diff throw "Session not found" for worktree sessions: `ensureSessionLoaded(sid)` reads only the main dir. Fix: resolve the session file across worktree dirs for both the message load and the fork's file-history (checkpoint) read. Re-injects `__ccWtResolve` if absent, so it is self-sufficient.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting anything.
