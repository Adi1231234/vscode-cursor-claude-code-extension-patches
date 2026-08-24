/* Where the panel is, and how much of the workbench viewport is not it.

   The iframe is matched on the panel's own webview id, not on "the first Claude
   webview": a window can hold several, and the one being measured has to be the
   one being resized.

   `chrome` is everything beside the panel - side bar, activity bar, auxiliary bar,
   whatever a layout happens to have. It is not enumerated, it is subtracted, so a
   layout nobody thought of still measures correctly. */

export const LAYOUT = (id) => `(() => {
  const frame = [...document.querySelectorAll('iframe')]
    .find((f) => ((f.getAttribute('src') || '') + (f.src || '')).includes(${JSON.stringify(id)}));
  if (!frame) return { viewport: window.innerWidth, height: window.innerHeight };
  const r = frame.getBoundingClientRect();
  return {
    viewport: window.innerWidth,
    height: window.innerHeight,
    panel: { left: r.left, right: r.right, width: r.width },
    chrome: window.innerWidth - r.width,
  };
})()`;

export const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
