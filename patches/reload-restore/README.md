# Reload restore

**Type:** bug fix
**Touches:** `extension.js + webview/index.js`
**Guard marker:** `/* RELOADFIX */ + let __ra=function`

Blank / new-chat tabs after "Reload Window" - four coupled sub-fixes: (1) pass the saved `sessionID` on deserialize; (2) recovery - re-load a webview whose iframe never ran; (3) bump the `git worktree list` timeout 5s -> 20s (a timeout drops worktree sessions from the list); (4) retry `activateSessionFromServer` instead of silently opening a new chat. See the repo root README for the full root-cause writeup.

All four injected pieces are JS files under `js/`, filled via `Get-InjectedJs` - no JS lives in the PowerShell: `session-id.js` (fix 1, `__STATE__` -> `${3}`), `blank-iframe-recovery.js` (fix 2, host), `timeout.js` (fix 3, the value `20000`), `activate-retry.js` (fix 4, webview). `patch.ps1` only anchors, fills the `__TOKEN__` placeholders, and writes.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting anything.

## The webview anchor moved in 2.1.240

Sub-fix (4) stopped applying and said so with a `[miss]` on every run - which is
easy to read past, and means the silent-new-chat behaviour was back for anyone on
that version. The site is still there; its shape changed. It used to be a bare
statement with an optional `cleanup(),` and an optional `.catch`:

    else if(f.initialSession)l.activateSessionFromServer(...).then((w)=>{if(!w)C(),l.createSession(...)})

and is now a block that does its own housekeeping in three places:

    else if(f.initialSession){if(v!==f.initialSession)_(v);
      l.activateSessionFromServer(...).then((w)=>{if(!w){if(C(),_(f.initialSession),v!==f.initialSession)_(v);
        l.createSession(...)}}).catch(()=>{if(C(),_(f.initialSession),v!==f.initialSession)_(v)})}

`patch.ps1` anchors both shapes and **captures those statements whole**, threading
them back through `__PRE__` / `__FAIL__` / `__CATCH__` rather than re-authoring
them - the retry has to leave the surrounding bookkeeping exactly where it was, and
re-typing it from memory is how a restore quietly starts clearing the wrong id.
Verified on 2.1.241: the patched region is byte-for-byte the original's
housekeeping around the retry loop, and a real `Developer: Reload Window` brings
the conversation back instead of an empty chat.

**An install patched before this fix keeps the miss.** The guard for this sub-fix
is `let __ra=function` in `webview/index.js`, so a bundle that never got it will
pick it up on the next run - but a bundle patched by an older revision of this
patch has the other three fixes and their `/* RELOADFIX */` guard already, and
only this one was missing. Re-running `apply.ps1` is enough; restoring pristine
bundles is not required here.
