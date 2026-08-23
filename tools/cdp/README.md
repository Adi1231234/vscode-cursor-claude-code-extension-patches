# tools/cdp - drive the Claude panel of a running editor

Verifying a webview patch by hand means opening the panel and clicking. This runs
a script **inside the panel of a named window** instead, so a change can be checked
against the real bundle, the real stylesheet and the real DOM.

Open a CDP port first - see **Attaching a real debugger to the webview (CDP)** in
the root `CLAUDE.md`. Then:

```
node tools/cdp/cdp.mjs list
node tools/cdp/cdp.mjs eval <window-substring> <script.js>
```

`list` prints one line per Claude panel: the window that owns it and its target id.
`eval` runs the file in the panel of the matching window; if the substring matches
more than one panel it refuses and prints the candidates, so pass a target id.
`--port N` (or `CDP_PORT`) overrides the default 9333.

The script is **one expression**, evaluated as if it were written in the panel -
`document` is the panel's document, and `new MouseEvent(...)` is built in the right
realm. Wrap anything longer in `(async () => { ... })()`; whatever it returns is
printed as JSON. A script that throws prints `{"__error": ...}` and exits 1.

```js
(async () => {
  const rows = [...document.querySelectorAll('.__qRow')];
  return { rows: rows.length, nav: rows[0] && rows[0].querySelectorAll('.__qNav button').length };
})()
```

## The two things that make this awkward without the helper

- **A webview iframe is out-of-process.** `Page.getFrameTree` on a *window* target
  does not list it, so a window cannot be walked down to its webviews. The window's
  own DOM does still hold the `<iframe>` **element**, and its `src` carries the same
  `?id=<uuid>` as the webview target's url - that is the exact mapping `panels.mjs`
  uses. Matching on screen geometry instead (an OOPIF reports its top-level window's
  `screenX`/`screenY`) looks like it works and then silently mislabels every window
  stacked in the same place.
- **The target CDP lists is the webview *shell*** - one `<script>`, empty body. The
  panel's DOM is one frame deeper. That child frame has its own default execution
  context inside the same target, so `Runtime.evaluate` with its `contextId` lands
  in the panel directly, with no `contentWindow` hops.

## Driving a live editor without breaking anything

This talks to a **real** window with a **real** session. Three rules that came out
of using it:

- **Nothing may be sent to Claude by accident.** Queue items added the normal way
  (`Alt+Enter` in the composer) are safe: `commitComposerToQueue(..., hold=true)`
  parks the queue when idle, so the flush loop will not fire. Check the header reads
  `paused · N queued` before going further.
- **Put the DOM back.** Remove anything injected, delete any queue items added, and
  confirm at the end: no `.__qRow` left, no stray `ccq:<sid>` key in `localStorage`.
- **Do not clobber the clipboard.** Swap `navigator.clipboard.writeText` for a
  collector while testing a copy path, and restore it afterwards.

## Layout

- `client.mjs` - CDP transport (`targets`, `connect`, `evaluate`).
- `panels.mjs` - window -> webview mapping and the panel execution context.
- `cdp.mjs` - the CLI.

No dependencies: Node 18+ for `fetch`, Node 22 for the global `WebSocket`.
