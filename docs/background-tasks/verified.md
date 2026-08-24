# Background tasks: what the real editor caught

`tools/lab` runs the patch against a pristine bundle in an editor that is not
yours, with the panel open and a debugger attached. Everything below was found
there and could not have been found in a browser harness.

`tools/lab` ran the whole thing against a pristine 2.1.241 with every patch applied.
What that caught, and the browser harness could not:

- **`ResizeObserver` never fires in this webview.** A fresh observer saw nothing
  while its element went 619px to 278px, so the dialog never adopted the stacked
  layout and the two panes were crushed in a narrow panel. The same "a webview off
  screen gets no rendering opportunity" trap as `requestAnimationFrame`. The layout
  is now measured on every render pass; the observer is only a fast path.
- The `--app-*` and `--vscode-*` tokens resolve for real - the browser fell back on
  every one of them, including the scrollbar slider colour.
- A `background: var(...)` shorthand serialises its longhands as empty, so reading
  `cssText` back proves nothing. Test the effect, not the serialisation.
- The dialog is not clipped at zoom 1 / 1.25 / 1.5 / 2 with `patches/zoom` live,
  which is what moving off `vh` was for.
- The host bridge works end to end: the panel's `__ccbg` reached the host through
  the real connection, `listHistory` found a real file by scanning for the session
  uuid, and two separate appends arrived as two ordered, byte-exact deltas.
