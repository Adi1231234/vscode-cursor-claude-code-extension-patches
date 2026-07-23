# Reload restore

**Type:** bug fix
**Touches:** `extension.js + webview/index.js`
**Guard marker:** `/* RELOADFIX */ + let __ra=function`

Blank / new-chat tabs after "Reload Window" - four coupled sub-fixes: (1) pass the saved `sessionID` on deserialize; (2) recovery - re-load a webview whose iframe never ran; (3) bump the `git worktree list` timeout 5s -> 20s (a timeout drops worktree sessions from the list); (4) retry `activateSessionFromServer` instead of silently opening a new chat. See the repo root README for the full root-cause writeup.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting anything.
