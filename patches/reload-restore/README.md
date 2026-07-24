# Reload restore

**Type:** bug fix
**Touches:** `extension.js + webview/index.js`
**Guard marker:** `/* RELOADFIX */ + let __ra=function`

Blank / new-chat tabs after "Reload Window" - four coupled sub-fixes: (1) pass the saved `sessionID` on deserialize; (2) recovery - re-load a webview whose iframe never ran; (3) bump the `git worktree list` timeout 5s -> 20s (a timeout drops worktree sessions from the list); (4) retry `activateSessionFromServer` instead of silently opening a new chat. See the repo root README for the full root-cause writeup.

All four injected pieces are JS files under `js/`, filled via `Get-InjectedJs` - no JS lives in the PowerShell: `session-id.js` (fix 1, `__STATE__` -> `${3}`), `blank-iframe-recovery.js` (fix 2, host), `timeout.js` (fix 3, the value `20000`), `activate-retry.js` (fix 4, webview). `patch.ps1` only anchors, fills the `__TOKEN__` placeholders, and writes.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting anything.
