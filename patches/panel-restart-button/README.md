# Panel restart button

**Type:** feature
**Touches:** `webview/index.js + extension.js`
**Guard markers:** `/* PANELRESTARTBTN */` (webview) + `/* PANELRESTART */` (host)

A **Restart Claude** icon in the panel header, immediately left of Session
history. Clicking it reloads *that one panel* - the webview and the CLI process
behind it - and comes back on the same session, leaving every other Claude panel
and the rest of the window alone.

Today the only way out of a wedged panel is `Developer: Reload Window`, which
takes every panel and the whole workbench with it.

## What the click actually does

1. **webview** - the button posts `{type:"ccReloadPanel", sessionId}` down the
   existing webview -> host channel (`context.comms.connection.value.send`).
   Nothing wraps `acquireVsCodeApi`; the app's own transport is reused.
2. **host** - `__ccReloadWebview` re-assigns `webview.html`, rebuilt by
   upstream's own `getHtmlForWebview` with the session the panel is showing
   *now* and no initial prompt. `getHtmlForWebview` mints a fresh nonce on every
   call, so the string always differs and the assignment always re-renders.
3. **webview, again** - `webview/index.js` runs from scratch, reads
   `data-initial-session`, and `activateSessionFromServer` restores the
   conversation (the path `patches/reload-restore` hardens).
4. **CLI** - the fresh client sends `init` with no `channelId`. That is
   upstream's own "the client reloaded" signal: `processRequest`'s `init` case
   closes every channel the comms object still holds
   (`clientInitImpliesFreshClient` is `true` for the webview comms class). The
   old `claude` process is torn down and the booting webview launches a new one
   resuming the same session id. Reconnecting is therefore upstream behaviour we
   trigger, not behaviour we reimplement.

So one message buys both halves: the panel is rebuilt *and* Claude is restarted
under it.

## Why the shape flags are recorded

The same `getHtmlForWebview` serves three different surfaces - the editor-tab
panel, the sidebar view and the session-list view - and only the call site knows
which flags a given view was built with (`IS_SIDEBAR` / `IS_FULL_EDITOR` /
`IS_SESSION_LIST_ONLY`). Rather than duplicating that knowledge at each of the
three `onDidReceiveMessage` sites, the patch records the three flags per webview
in a `WeakMap` as `getHtmlForWebview` runs, and replays them on reload. The
interception is then the *same* one-line wrapper at all three sites, and a view
reloads exactly as it was first built.

## Anchors

- **Header button** - a zero-width lookahead in front of the Session history
  button that also requires the New session button right after it. It captures
  the app's icon-button component, the context and the sessions store from that
  existing markup, so the injected button is upstream's own component with
  upstream's own `iconSize` - nothing about its size, hover, focus ring or
  aria/title wiring is chosen here. Nothing is consumed, so no existing code is
  retyped.
- **`getHtmlForWebview(<6 params>){`** - the definition (call sites all carry a
  `this.` prefix and non-identifier arguments, so the regex cannot hit them).
- **`<view>.webview.onDidReceiveMessage((<msg>)=>{<log>,<comms>?.fromClient(<msg>)}`**
  - matched three times; the original body is captured whole and threaded back
  through the wrapper rather than re-authored.

All three are resolved before anything is written: a button with no host handler
behind it is worse than no button, so a single missing anchor leaves both
bundles untouched and reports `[miss]`.

## The glyph

Drawn on the neighbouring clock icon's own geometry: centre `10,10`, a filled
annulus between `r=6.5` and `r=7.5` - a 1px ring, the same weight the Session
history icon uses - swept 293 degrees clockwise from 65 to 132 degrees, closed
by an arrowhead whose base lies across that ring end and whose tip runs on to
108 degrees. The gap therefore sits at the top and the arrow reads clockwise.
`fill:"currentColor"`, so it themes with everything else in the header.

## Not a confirmation dialog

The button restarts without asking, like New session beside it. A restart while
Claude is mid-turn kills that turn; the transcript is on disk either way and the
session resumes, but the in-flight answer is lost.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`).
Idempotent and fail-safe.
