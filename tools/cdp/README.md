# tools/cdp - drive the Claude panel of a running editor

Verifying a webview patch by hand means opening the panel and clicking. This runs
a script **inside the panel of a named window** instead, so a change can be checked
against the real bundle, the real stylesheet and the real DOM.

This is for an editor that is **already running** - usually your own. To check a
patch, do not point it at your own install: `node tools/lab/lab.mjs up` builds a
throwaway editor with the patched bundle and a port already open, and hands you
its panel. It uses everything here.

Open a CDP port first - see **Attaching a real debugger to the webview (CDP)** in
the root `CLAUDE.md`. Then:

```
node tools/cdp/cdp.mjs list
node tools/cdp/cdp.mjs eval <window-substring> <script.js>
node tools/cdp/cdp.mjs reload <window-substring>
node tools/cdp/cdp.mjs command <window-substring> "<palette title>" [--dry]
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

## Reloading a window - and why a renderer reload is not enough

`reload` runs the real `Developer: Reload Window` and then waits for the panel to
come back. Use it after `apply.ps1` has rewritten a bundle under a running editor.

**Patch the bundle under a running editor, reload only the renderer, and the panel
comes back blank.** Reproduced 2/2 against a live 2.1.241 install: rewrite
`webview/index.js`, `Page.reload` the window, and the panel is an empty document
with `Uncaught SyntaxError: Unexpected token 'var'` blamed on `index.js` - *at the
same line and column whatever the file now contains*, i.e. the browser is parsing
something other than what is on disk. The control run matters: the identical
`Page.reload` with the file **unchanged** brings the panel back healthy, and the
blank one survives further renderer reloads until a real `Developer: Reload Window`
clears it. So it is the changed-file-underneath that breaks, not the reload itself.
(`Developer: Reload Webviews` is the lighter command to try first - `cdp.mjs
command <window> "Developer: Reload Webviews"`.)

**The renderer has no command API, so the palette is the way in.** There is no
`require` and no service handle on the workbench window - only the sandbox
preload's `window.vscode` (`ipcRenderer` restricted to `vscode:` channels,
`process`, `context`, `webFrame`). The one reload channel it can reach is
`vscode:reloadWindow`, and main handles it as `sender.reload()`: a plain renderer
reload, i.e. exactly what `Page.reload` already does, and what Ctrl+R is wired to
in the bootstrap. The command runs `INativeHostService.reload()` ->
`CodeWindow.reload()`, which rebuilds the window configuration and re-loads it -
reachable only the way a person reaches it. So `palette.mjs` types: CDP's Input
domain delivers **trusted** key events to the renderer, so `Ctrl+Shift+P`, the
title, and `Enter` go through the keybinding service exactly as a person's would.
No OS-level automation, and the window does not need to be focused or visible.

Two details that are not obvious:

- **The shortcut is dropped while the window is still settling** - right after a
  reload, most of all. `openPalette` re-sends it up to three times instead of
  failing on the first miss.
- **It refuses rather than guesses.** After typing the title it reads the list and
  runs the first row only if that row starts with the title asked for; otherwise it
  presses Escape and reports what it saw. `--dry` stops there deliberately.

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
- **A picture of the panel has to come from the *window* target.**
  `Page.captureScreenshot` on the webview target fails with `Command can only be
  executed on top-level targets`; run it on the `type: "page"` target named after
  the window and the composited frame includes the panel.

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
- `panels.mjs` - window -> webview mapping, the panel execution context, and
  `waitForPanel` (a reload builds a new panel with a new id).
- `palette.mjs` - running a workbench command in a window by typing its Command
  Palette over the Input domain.
- `cdp.mjs` - the CLI.

No dependencies: Node 18+ for `fetch`, Node 22 for the global `WebSocket`.

## Two things that waste an hour when driving the panel

- **Enter needs `text: ""`, not `text: "Enter"`.** `Input.dispatchKeyEvent` with
  the key *name* in `text` is accepted, the app sees the event, and nothing is
  submitted - the prompt just sits in the composer looking like the send silently
  failed. The same applies to any key whose character you actually want typed.
- **`apply.ps1` writes with `Write-Host`, which does not go through the pipeline.**
  `& ./apply.ps1 | Out-String` captures nothing, so a test that greps that output
  concludes the run did nothing. Run it as a child process (`powershell.exe -File
  apply.ps1`) and read *that* process's stdout, which is what `tools/lab` does.
