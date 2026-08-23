/* Getting from "the editor is up" to "here is a Claude panel I can evaluate in".

   The panel is not open on a fresh profile and there is no command API in the
   renderer, so it is opened the way a person opens it - through the palette
   (tools/cdp/palette.mjs types it over CDP's Input domain). `claudePanels`
   only reports a panel once its composer exists, so polling it is also the
   readiness check: when it answers, the webview has rendered. */

import { targets } from '../cdp/client.mjs';
import { claudePanels } from '../cdp/panels.mjs';
import { runCommand } from '../cdp/palette.mjs';

const OPEN = 'Claude Code: Open in New Tab';

export async function ensurePanel(port, log, tries = 40) {
    const open = await waitForPanel(port, 1);
    if (open) return open;

    const page = (await targets(port)).find((t) => t.type === 'page' && t.title);
    if (!page) throw new Error('the editor has no window yet');
    log('opening the panel');
    const r = await runCommand(page, OPEN);
    if (!r.ok) throw new Error(`could not run "${OPEN}": ${r.reason}`);

    const panel = await waitForPanel(port, tries);
    if (!panel) throw new Error('the panel did not render (see <lab>/ud/logs/**/exthost)');
    return panel;
}

export async function waitForPanel(port, tries = 40, waitMs = 1000) {
    for (let i = 0; i < tries; i++) {
        const hit = (await claudePanels(port).catch(() => []))[0];
        if (hit) return hit;
        if (i + 1 < tries) await new Promise((r) => setTimeout(r, waitMs));
    }
    return null;
}
