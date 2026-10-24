# zoom (desktop)

Ctrl + mouse-wheel, and trackpad pinch, to zoom the Code tab. The app ships the
Ctrl +/- / 0 menu items already; this adds the wheel gesture (the parent repo's
`zoom` does the same for the webview).

## How

- Only the session content grows - the conversation, the composer and the line
  below it (usage, mode). Not the sidebar, not the title bar. So it does NOT use
  the app's native (webFrame) zoom, which scales the whole window and is one
  level for the whole app. It sets CSS `zoom` on the one column that wraps the
  conversation and the composer: the scroll element just below the title bar,
  found as the child of the element carrying the `--titlebar-end-inset` custom
  property (measured live). CSS `zoom` reflows, so the column's own box stays
  and its content scales inside - no horizontal scroll, bars untouched.
- A capturing, non-passive `wheel` listener handles `ctrlKey` wheel events
  (pinch arrives the same way), one `0.5` level step per notch, clamped.

## Per conversation, not per app

The app's native zoom is one level for the whole app - Chromium keeps it per
origin, so every Claude window zooms together. The level is instead stored per
session id (`ccd.zoom.<sid>`) and re-applied whenever the conversation on
screen changes (`desktop/lib/js/session.js`'s `__ccdSessions.onCurrent`): switch
to a conversation and its own zoom comes back, Ctrl+wheel changes only that one.
A conversation with no saved level sits at the base (0 = 1x). This matches what
the VS Code panel already does (one zoom per panel), which is what the person
asked for.

## Status

Verified in the real app (Windows Sandbox, `tools/sandbox`): zooming conversation
A then switching to B shows B at its own base; back to A restores A's zoom, back
to B restores B's; each persisted under its own key. Measured and seen: only the
content column scales (its CSS zoom changes), the sidebar rect is unchanged, and
a screenshot shows the sidebar and title bar at normal size while the
conversation, composer and the line below it are enlarged.
