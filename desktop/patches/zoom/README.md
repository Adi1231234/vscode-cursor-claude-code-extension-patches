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
- The level is saved to `localStorage` best-effort and re-applied on load; if
  `webFrame` is ever missing it falls back to CSS `body.zoom`.

## Status

Written against the confirmed preload injection model; the live check (native
zoom + that Ctrl+wheel is otherwise unbound in the app) is done in the sandbox
integration pass, since it depends on Electron, not on the web DOM.
