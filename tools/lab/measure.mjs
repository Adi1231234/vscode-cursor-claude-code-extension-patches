/* Reading the panel's width, from both sides of the iframe boundary.

   Inside the panel is the number a patch is laid out against, and it is the one
   that can be stale: a window that is not on screen runs no layout, so the panel
   keeps answering with the size it had when it was last visible - measured, 643
   reported three times running for a panel the window had already moved to 300.
   So both sides are read and the caller is told when they disagree, instead of
   being handed the stale one as fact. */

import { connect, targets, unwrap } from '../cdp/client.mjs';
import { evalInPanel } from '../cdp/panels.mjs';
import { LAYOUT, UUID } from './layout.mjs';

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
