# Reload restore

**Type:** bug fix
**Touches:** `extension.js + webview/index.js`
**Guard marker:** `/* RELOADFIX */ + let __ra=function`

Blank / new-chat tabs after "Reload Window" - four coupled sub-fixes: (1) pass the saved `sessionID` on deserialize; (2) recovery - re-load a webview whose iframe never ran; (3) bump the `git worktree list` timeout 5s -> 20s (a timeout drops worktree sessions from the list); (4) retry `activateSessionFromServer` instead of silently opening a new chat. See the repo root README for the full root-cause writeup.

The two injected runtimes are formatted JS under `js/`: `blank-iframe-recovery.js` (fix 2, host) and `activate-retry.js` (fix 4, webview). Their `__TOKEN__` placeholders are the captured minified var names; `patch.ps1` anchors, fills them via `Get-InjectedJs`, and writes - no JS lives in the PowerShell. Fixes (1) and (3) are surgical token-level rewrites of a matched anchor, so they stay inline.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting anything.
