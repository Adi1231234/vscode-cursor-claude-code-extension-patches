/* The width of the lab's Claude panel - a test parameter, not a detail.

   Everything the panel places against its own edges - popovers, wrapping,
   ellipsising, RTL - only misbehaves once the panel is narrow, and `up` opens
   it as an editor tab, which is wide. Without a way to set the width, the
   regime those bugs live in is exactly the one the lab never reproduces.
   `patches/history-dialog-clip` is the worked example: correct at 790px,
   157px outside the panel at 300px.

   There is no command API for the workbench layout, so the width is set the way
   a person sets it: by dragging the sash beside the panel. It has to be CDP's
   Input domain - those events are trusted, so the sash's own pointer handling
   runs. Synthetic PointerEvents dispatched into the DOM are ignored by it and
   the drag silently does nothing (measured: the side bar stayed 296px through
   twelve of them).

   The result is read back from INSIDE the panel, because that is the number the
   panel's own code sees, and it is not always what you asked for - VS Code
   clamps to its minimum widths. Callers report both. */

import { connect, targets, unwrap } from '../cdp/client.mjs';
import { evalInPanel } from '../cdp/panels.mjs';

/* This panel's iframe and every sash still draggable, in window coordinates.
   The iframe is matched on the panel's own webview id, not on "the first Claude
   webview": a window can hold several, and the one being measured has to be the
   one being resized. */
const LAYOUT = (id) => `(() => {
  const frame = [...document.querySelectorAll('iframe')]
    .find((f) => ((f.getAttribute('src') || '') + (f.src || '')).includes(${JSON.stringify(id)}));
  const sashes = [...document.querySelectorAll('.monaco-sash.vertical')]
    .filter((s) => !s.classList.contains('disabled'))
    .map((s) => { const r = s.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (!frame) return { sashes };
  const r = frame.getBoundingClientRect();
  return { panel: { left: r.left, right: r.right, width: r.width }, sashes };
})()`;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

export async function readWidth(panel) {
    const w = await evalInPanel(panel.target, 'document.documentElement.clientWidth');
    return typeof w === 'number' ? w : null;
}

export async function setWidth(port, panel, want) {
    if (!Number.isFinite(want) || want < 120) throw new Error(`--width needs a number of pixels, at least 120 (got "${want}")`);
    const page = (await targets(port)).find((t) => t.type === 'page' && t.title);
    if (!page) throw new Error('the lab has no editor window');

    const id = (String(panel.target.url || '').match(UUID) || [])[0];
    if (!id) throw new Error('this panel has no webview id to find it by');

    const client = await connect(page.webSocketDebuggerUrl);
    try {
        const view = unwrap(await client.send('Runtime.evaluate', { expression: LAYOUT(id), returnByValue: true }));
        if (!view || !view.panel) throw new Error('this panel has no iframe in the window - is it still open?');
        const sash = nearestSash(view);
        if (!sash) throw new Error('the panel has no draggable sash beside it - open the side bar, or widen the window');
        const delta = want - view.panel.width;
        await drag(client, sash, sash.x + (sash.side === 'left' ? -delta : delta));
    } finally {
        client.close();
    }
    await new Promise((r) => setTimeout(r, 700));
    return readWidth(panel);
}

/* Which boundary actually governs this panel: the nearest sash sitting on one
   of its edges. Moving a sash on the left towards the left widens the panel;
   on the right it is the other way round, which is why the side is carried. */
function nearestSash({ panel, sashes }) {
    let best = null;
    for (const s of sashes) {
        const side = s.x <= panel.left + 4 ? 'left' : s.x >= panel.right - 4 ? 'right' : null;
        if (!side) continue;
        const distance = side === 'left' ? panel.left - s.x : s.x - panel.right;
        if (!best || distance < best.distance) best = { ...s, side, distance };
    }
    return best;
}

/* A press, a few moves, a release - the sash follows the pointer, so it needs
   the intermediate moves, not just the endpoint. */
async function drag(client, sash, toX) {
    const mouse = (type, x) => client.send('Input.dispatchMouseEvent', {
        type, x, y: sash.y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1,
    });
    await mouse('mousePressed', sash.x);
    for (let i = 1; i <= 8; i++) await mouse('mouseMoved', sash.x + ((toX - sash.x) * i) / 8);
    await mouse('mouseReleased', toX);
}
