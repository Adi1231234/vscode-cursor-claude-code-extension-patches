# Reload restore

**Type:** bug fix + one deliberate override
**Touches:** `extension.js`
**Guard marker:** `/* RELOADFIX */`

Blank / new-chat tabs after "Reload Window". This started as four sub-fixes; the
app has since grown a restore of its own, so two of them are gone and one has
changed meaning. What is left:

1. **The saved `sessionID` is seeded on deserialize** - which now *removes the
   app's 10-minute limit* rather than fixing a bug. See below.
2. **Recovery: re-load a webview whose iframe never ran.**
3. **`git worktree list` timeout 5s -> 20s** - a timeout there drops worktree
   sessions from the list, and since 2.1.278 it also drops their transcripts (the
   app resolves a session file by walking the worktrees that command reports).

All three injected pieces are JS files under `js/`, filled via `Get-InjectedJs`:
`session-id.js` (1, `__STATE__` -> `${3}`), `blank-iframe-recovery.js` (2),
`timeout.js` (3, the value `20000`). `patch.ps1` only anchors, fills the
`__TOKEN__` placeholders, and writes. Idempotent and fail-safe: an anchor that
does not match skips that sub-fix and leaves the file untouched.

## What the app now does by itself (2.1.278)

The webview persists `{sessionID, sessionUpdatedAt}` in its own VS Code webview
state and, on boot, offers it as `sessionToResume`; the host reads the same two
fields in `deserializeWebviewPanel` and binds the panel with
`registerPanelSession`. The panel's boot decision is a small table -
`keep_opened` / `resume_saved` / `teleport` / `open_session` /
`fresh_after_missing_saved` / `fresh_with_prompt` / `blank`.

**But only inside a 10-minute window.** Both halves gate on the same constant
(`F24 = 600000`): past it the panel reports `restore_declined` and you get an
empty chat. Sub-fix (1) seeds `data-initial-session` with the saved id
regardless, and the boot table reaches `open_session` exactly when the app's own
`resume_saved` has declined - so the two do not fight, and a window reloaded an
hour later comes back to its conversation. That is a **preference**, not a bug
fix: drop this sub-fix and you get upstream's policy.

## What was removed

**The webview half.** It replaced the branch that called
`activateSessionFromServer` once and silently opened a new chat if it returned
false. In 2.1.278 that whole boot path was rewritten: `activateSessionFromServer`
now looks in the local list, asks the server with `listSessions("activate")`,
checks an `isSuperseded` callback and looks again - the retry this patch used to
add, done upstream. The file and its anchors are gone; `git log` has them.

## The `setupPanel` anchor, and why it is written the way it is

Sub-fix (2) inserts between the panel's message listener and its view-state
listener, and needs four of `setupPanel`'s parameters to rebuild the HTML the
same way `setupPanel` does. Both ends of that site have moved:

- the parameter list grew a fifth entry in 2.1.278, so it is matched with a
  tolerant `(?:,[\w$]+)*` tail rather than a fixed arity - the first four are the
  ones `getHtmlForWebview` is handed, here and upstream;
- the message listener's disposables argument went from `this.disposables` to a
  local array (`,null,V)`), so it is matched as `[\w$.]+`;
- the `let` line before `onDidChangeViewState` has gained and lost declarations
  twice, so it is matched as one statement (`let [\w$]+=[^;]{0,200};`) rather
  than by its contents.

Checked against every version in the lab's VSIX cache - **2.1.241, 245, 246, 247,
250, 252, 258, 278, 280** - the signature matches and the insertion point matches
**exactly once** in each. The four parameter names across those releases are
`e,t,r,n` / `$,J,X,Y` / `$,Q,J,X` / `$,J,Q,X` / `$,Q,X,Y`: nine releases, five
different spellings, which is why nothing here is written down and the panel name
is `[regex]::Escape`d before it is spliced back into a pattern.
