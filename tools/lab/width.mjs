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

   The result comes back through measure.mjs, which reads both sides of the iframe
   boundary: what was asked for is not always what the layout allows, and a window
   that is not on screen answers with a stale number rather than an honest one. */

import { connect, targets, unwrap } from '../cdp/client.mjs';
import { LAYOUT, UUID } from './layout.mjs';
import { readWidth } from './measure.mjs';

export async function setWidth(port, panel, want) {
    if (!Number.isFinite(want) || want < 120) throw new Error(`--width needs a number of pixels, at least 120 (got "${want}")`);
    const page = (await targets(port)).find((t) => t.type === 'page' && t.title);
    if (!page) throw new Error('the lab has no editor window');

    const id = (String(panel.target.url || '').match(UUID) || [])[0];
    if (!id) throw new Error('this panel has no webview id to find it by');

    /* `moved` is the difference between the layout refusing the width and the drag
       never happening - which look identical in the number that comes back. `from`
       tells the caller which way it went, so a drag that moved the panel further
       from what was asked for is not reported as the layout's minimum. */
    let moved = false, from = null;
    const client = await connect(page.webSocketDebuggerUrl);
    try {
        const look = async () => {
            const v = unwrap(await client.send('Runtime.evaluate', { expression: LAYOUT(id), returnByValue: true }));
            if (!v || !v.panel) throw new Error('this panel has no iframe in the window - is it still open?');
            return v;
        };
        let view = await look();
        from = view.panel.width;
        if (!edgeSashes(view).length) throw new Error('the panel has no draggable sash beside it - open the side bar, or widen the window');

        /* A panel in the editor area has a sash on both edges, and which of them
           governs its width depends on where the layout gives. Pull each in turn,
           re-measuring, and stop as soon as one has delivered the width.

           Twice, because one drag can change which sashes exist: when the panel's
           right edge is the window's, the only sash beside it is the side bar's,
           and pulling that far enough collapses the side bar - which hands the
           space to the editor area and makes the panel *wider* (measured: asked
           400, got 1409). A right-edge sash exists after that, so a second pass
           can do what the first could not. */
        for (let pass = 0; pass < 2; pass++) {
            for (const sash of edgeSashes(view)) {
                const delta = want - view.panel.width;
                if (Math.abs(delta) <= 2) break;
                await drag(client, sash, sash.x + (sash.side === 'left' ? -delta : delta));
                await new Promise((r) => setTimeout(r, 250));
                view = await look();
            }
            if (Math.abs(want - view.panel.width) <= 2) break;
        }
        moved = Math.abs(view.panel.width - from) > 2;
    } finally {
        client.close();
    }
    await new Promise((r) => setTimeout(r, 300));
    return { ...(await readWidth(panel, port)), moved, from };
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
