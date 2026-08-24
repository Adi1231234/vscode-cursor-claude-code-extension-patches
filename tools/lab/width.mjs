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

/* Inside the panel: the number the panel's own code sees, which is what a patch is
   actually laid out against. */
async function innerWidth(panel) {
    const w = await evalInPanel(panel.target, 'document.documentElement.clientWidth');
    return typeof w === 'number' ? Math.round(w) : null;
}

/* From the workbench: the iframe's own box. The window is never throttled, so this
   is the truth about the layout even when the panel has not caught up. */
async function outerWidth(port, panel) {
    const page = (await targets(port)).find((t) => t.type === 'page' && t.title);
    const id = (String(panel.target.url || '').match(UUID) || [])[0];
    if (!page || !id) return null;
    const client = await connect(page.webSocketDebuggerUrl);
    try {
        const view = unwrap(await client.send('Runtime.evaluate', { expression: LAYOUT(id), returnByValue: true }));
        return view && view.panel ? Math.round(view.panel.width) : null;
    } finally { client.close(); }
}

/* A webview that is not on screen gets no rendering opportunity, so it is not
   re-laid-out and keeps answering with the size it had when it was last visible -
   measured: 643 reported three times running for a panel the workbench had already
   moved to 300. Poll both sides until they agree rather than reporting a stale
   number as fact, and when they never do, say which is which. */
export async function readWidth(panel, port) {
    let inner = await innerWidth(panel);
    if (port === undefined) return inner;
    let outer = null;
    for (let i = 0; i < 12; i++) {
        outer = await outerWidth(port, panel);
        inner = await innerWidth(panel);
        if (inner === null || outer === null || Math.abs(inner - outer) <= 2) break;
        await new Promise((r) => setTimeout(r, 150));
    }
    return { inner, outer, settled: inner === null || outer === null || Math.abs(inner - outer) <= 2 };
}

export async function setWidth(port, panel, want) {
    if (!Number.isFinite(want) || want < 120) throw new Error(`--width needs a number of pixels, at least 120 (got "${want}")`);
    const page = (await targets(port)).find((t) => t.type === 'page' && t.title);
    if (!page) throw new Error('the lab has no editor window');

    const id = (String(panel.target.url || '').match(UUID) || [])[0];
    if (!id) throw new Error('this panel has no webview id to find it by');

    /* `moved` is the difference between the layout refusing the width and the drag
       never happening - which look identical in the number that comes back. */
    let moved = false;
    const client = await connect(page.webSocketDebuggerUrl);
    try {
        const look = async () => {
            const v = unwrap(await client.send('Runtime.evaluate', { expression: LAYOUT(id), returnByValue: true }));
            if (!v || !v.panel) throw new Error('this panel has no iframe in the window - is it still open?');
            return v;
        };
        let view = await look();
        const started = view.panel.width;
        const edges = edgeSashes(view);
        if (!edges.length) throw new Error('the panel has no draggable sash beside it - open the side bar, or widen the window');

        /* A panel in the editor area has a sash on both edges, and which of them
           governs its width depends on where the layout gives. Pull each in turn,
           re-measuring, and stop as soon as one has delivered the width. */
        for (const sash of edges) {
            const delta = want - view.panel.width;
            if (Math.abs(delta) <= 2) break;
            await drag(client, sash, sash.x + (sash.side === 'left' ? -delta : delta));
            await new Promise((r) => setTimeout(r, 250));
            view = await look();
        }
        moved = Math.abs(view.panel.width - started) > 2;
    } finally {
        client.close();
    }
    await new Promise((r) => setTimeout(r, 300));
    return { ...(await readWidth(panel, port)), moved };
}

/* Every sash sitting on one of the panel's edges, nearest first. Moving a sash on
   the left towards the left widens the panel; on the right it is the other way
   round, which is why the side is carried. The right edge is tried before the left
   at equal distance: in the editor area the left one is the side bar's. */
function edgeSashes({ panel, sashes }) {
    const found = [];
    for (const s of sashes) {
        const side = s.x <= panel.left + 4 ? 'left' : s.x >= panel.right - 4 ? 'right' : null;
        if (!side) continue;
        found.push({ ...s, side, distance: side === 'left' ? panel.left - s.x : s.x - panel.right });
    }
    return found.sort((a, b) => a.distance - b.distance || (a.side === 'right' ? -1 : 1));
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
