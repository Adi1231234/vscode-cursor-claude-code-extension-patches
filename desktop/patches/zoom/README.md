# zoom (desktop)

Ctrl + mouse-wheel, and trackpad pinch, to zoom the Code tab. The app ships the
Ctrl +/- / 0 menu items already; this adds the wheel gesture (the parent repo's
`zoom` does the same for the webview).

## How

- Captures `require("electron").webFrame` at preload-eval time and drives
  Electron's own zoom level - the same one the menu changes. Using the native
  zoom (not CSS `body.zoom`) means the viewport and the layout coordinates stay
  in one system, so none of the CSS-zoom coordinate fixes the webview needed
  apply here.
- A capturing, non-passive `wheel` listener handles `ctrlKey` wheel events
  (pinch arrives the same way), one `0.5` level step per notch, clamped.
- If `webFrame` is ever missing it falls back to CSS `body.zoom`.

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
A to level 1.5 then switching to B shows B at its own base; switching back to A
restores 1.5, back to B restores B's level; each persisted under its own key.
The zoom is visible (level 4 clearly enlarged the whole UI).
