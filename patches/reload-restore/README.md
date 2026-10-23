# Reload restore

**Type:** bug fix
**Touches:** `extension.js`
**Guard marker:** `/* RELOADFIX */`

Blank / new-chat tabs after "Reload Window". This started as four sub-fixes; the
app has since grown a restore of its own, and a third was replaced by a root-cause
fix, so one is left:

1. **Recovery: re-load a webview whose iframe never ran.**

The injected piece is `js/blank-iframe-recovery.js`, filled via `Get-InjectedJs`
(`__PE__` and `__HTML_ARGS__`). `patch.ps1` only anchors, fills the `__TOKEN__`
placeholders, and writes. Idempotent and fail-safe: an anchor that does not match
leaves the file untouched.

## What the app now does by itself

The webview persists `{sessionID, sessionUpdatedAt}` in its own VS Code webview
state and, on boot, offers it as `sessionToResume`; the host reads the same two
fields in `deserializeWebviewPanel` and binds the panel with
`registerPanelSession`. The panel's boot decision is a small table -
`keep_opened` / `resume_saved` / `teleport` / `open_session` /
`fresh_after_missing_saved` / `fresh_with_prompt` / `blank`.

## What was removed

**The `git worktree list` timeout bump, 5s -> 20s** (2.1.309). A timeout there
makes the lister answer "no worktrees", so a worktree session is not found and
its tab opens a new empty chat. The bump only moved that point: on 2026-10-23 a
restart with five windows lost four tabs this way while the bump was not yet
in the bundle, and under that load a slower git would cross 20 s just as well.
`patches/worktree-list-fallback` answers a failed list from git's own files
instead, so the timeout is upstream's again and a tab waits at most 5 s.

**The webview half** (2.1.278). It replaced the branch that called
`activateSessionFromServer` once and silently opened a new chat if it returned
false. That boot path was rewritten upstream: `activateSessionFromServer` now
looks in the local list, asks the server with `listSessions("activate")`, checks
an `isSuperseded` callback and looks again - the retry this patch used to add.

**Seeding the saved `sessionID` on deserialize** (2.1.295). Both halves of the
upstream restore still carry a 10-minute constant, and this sub-fix put the saved
id into `data-initial-session` regardless, so a tab reloaded later would come
back to its conversation. Its anchor went dark in 2.1.287, when the second
argument to `setupPanel` stopped being a bare `void 0`, and nobody noticed -
because it is no longer needed. Measured on 2.1.295 in the lab, with a past
conversation opened from history in an editor tab: unpatched and patched side by
side, left idle, then a real Reload Window - after 12 minutes and again after 27,
**the unpatched tab came back to its conversation too**. The seeding did land
when re-anchored (`data-initial-session` set with it, absent without), it just
changed nothing a user sees. `git log` has the anchor and the JS.

## The anchors, and why they are written the way they are

Sub-fix (1) went dark in **2.1.292** and stayed that way until 2.1.295. What
moved:

- **setupPanel's signature** grew a fifth parameter in 2.1.278 and a sixth with a
  default (`W=!1`) in 2.1.292. Only the panel's name is taken from it now; the
  rest is matched as "more parameters, maybe with a simple default".
- **the render call** went from `getHtmlForWebview(<pe>.webview,J,Q,!1,X)` to
  seven arguments, the last a "reopened after restart" flag. The recovery used
  to rebuild that call from parameter positions; it now captures setupPanel's
  own `<pe>.webview.html=this.getHtmlForWebview(...)` and replays the argument
  list verbatim, so the retry is the same render whatever its arity.
- the message listener's disposables argument went from `this.disposables` to a
  local array (`,null,V)`) in 2.1.278, so it is matched as `[\w$.]+`; the `let`
  line before `onDidChangeViewState` has gained and lost declarations twice, so
  it is one statement (`let [\w$]+=[^;]{0,200};`) rather than its contents.

Checked against every version in the lab's VSIX cache - **2.1.241, 245, 246, 247,
250, 252, 258, 278, 280, 287, 292, 294, 295** - the signature, the render call
and the insertion point each match **exactly once** in each. The panel's name
went `e` -> `$`, and the other parameters through five spellings, which is why
nothing here is written down and the panel name is `[regex]::Escape`d before it
is spliced back into a pattern. Text captured from the bundle is `$`-escaped
before it goes into a replacement string.

Upstream's own "lost tab" watch (`checkForLostTabs`, 2.1.294) is not the same
thing: it reopens a Claude tab that VS Code shows with **no panel behind it**.
An iframe that was given its HTML and never ran still has its panel, so that
watch does not see it - sub-fix (1) stays.
