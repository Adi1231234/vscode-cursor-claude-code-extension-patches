/* Where the panel and the sashes are, in window coordinates.

   The iframe is matched on the panel's own webview id, not on "the first Claude
   webview": a window can hold several, and the one being measured has to be the
   one being resized. Shared by the code that measures the width and the code that
   drags it, so both always mean the same panel. */

/* This panel's iframe and every sash still draggable, in window coordinates.
   The iframe is matched on the panel's own webview id, not on "the first Claude
   webview": a window can hold several, and the one being measured has to be the
   one being resized. */
export const LAYOUT = (id) => `(() => {
  const frame = [...document.querySelectorAll('iframe')]
    .find((f) => ((f.getAttribute('src') || '') + (f.src || '')).includes(${JSON.stringify(id)}));
  const sashes = [...document.querySelectorAll('.monaco-sash.vertical')]
    .filter((s) => !s.classList.contains('disabled'))
    .map((s) => { const r = s.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (!frame) return { sashes };
  const r = frame.getBoundingClientRect();
  return { panel: { left: r.left, right: r.right, width: r.width }, sashes };
})()`;

export const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
