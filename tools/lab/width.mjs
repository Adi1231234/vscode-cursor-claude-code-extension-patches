/* The width of the lab's Claude panel - a test parameter, not a detail.

   Everything the panel places against its own edges - popovers, wrapping,
   ellipsising, RTL - only misbehaves once the panel is narrow, and `up` opens it
   as an editor tab, which is wide. Without a way to set the width, the regime
   those bugs live in is exactly the one the lab never reproduces.
   `patches/history-dialog-clip` is the worked example: correct at 790px, 157px
   outside the panel at 300px.

   The width is set by sizing the workbench viewport, not by dragging the sash
   beside the panel. Dragging is the obvious way and it is a trap: which sash
   governs the panel depends on the layout; pulling the side bar's sash far enough
   *collapses the side bar*, which hands its space to the editor area and makes the
   panel wider instead of narrower (measured: asked 400, got 1409); and once the
   side bar is gone there is no sash beside the panel at all, so the tool has
   locked itself out of its own parameter. That is not hypothetical - it is where
   an afternoon of testing left it.

   The panel is the editor area, so its width is the viewport minus whatever chrome
   sits beside it. Measure that and the viewport needed for any panel width is
   arithmetic: one CDP call, no mouse events, nothing to collapse, and it comes
   back down as easily as it goes up. Measured across 150 / 200 / 300 / 420 / 620 /
   780 / 1200 / 4000 - every one exact, with the panel's own clientWidth agreeing.

   The override belongs to the window's page target, not to the panel, so it
   survives a real `Developer: Reload Window` - measured: 300px before `repatch`,
   300px after. Setting a width once holds for the rest of the session. */

import { connect, targets, unwrap } from '../cdp/client.mjs';
import { LAYOUT, UUID } from './layout.mjs';
import { readWidth } from './measure.mjs';

/* The chrome beside the panel changes with the viewport - a side bar has a minimum
   of its own and gives up its space in steps - so one round of arithmetic can
   undershoot and the loop repeats until it stops making progress.

   The settle is the part that had to be measured rather than guessed. At 400ms the
   big narrowings stalled short and reported it honestly (1200 -> 150 landed on 214,
   then reached 150 when run again, because the second run started after the layout
   had finished moving); at 900ms every transition tried lands first time:
   1200 -> 150, 300 -> 150, 1400 -> 200, 150 -> 1200, 620 -> 300. A slower machine
   could still stall, and then the report says where the workbench settled instead
   of pretending the width was delivered. */
const ROUNDS = 4;
const PASSES = 5;
const SETTLE_MS = 900;

export async function setWidth(port, panel, want) {
    if (!Number.isFinite(want) || want < 120) throw new Error(`--width needs a number of pixels, at least 120 (got "${want}")`);
    const page = (await targets(port)).find((t) => t.type === 'page' && t.title);
    if (!page) throw new Error('the lab has no editor window');

    const id = (String(panel.target.url || '').match(UUID) || [])[0];
    if (!id) throw new Error('this panel has no webview id to find it by');

    const client = await connect(page.webSocketDebuggerUrl);
    let from = null;
    try {
        const look = async () => {
            const v = unwrap(await client.send('Runtime.evaluate', { expression: LAYOUT(id), returnByValue: true }));
            if (!v || !v.panel) throw new Error('this panel has no iframe in the window - is it still open?');
            return v;
        };
        let view = await look();
        from = Math.round(view.panel.width);
        /* A round can stall at an intermediate layout that still has a step left in
           it - the side bar shrinks to its minimum, the arithmetic stops moving, and
           running the command a second time then lands exactly, because it starts
           over from there. Measured: 1200 -> 150 stalling at 214, then reaching 150
           on the next invocation. So the restart happens here instead of being
           something the caller has to know to do. */
        for (let round = 0; round < ROUNDS && Math.abs(view.panel.width - want) > 1; round++) {
            let stuck = 0;
            for (let pass = 0; pass < PASSES && Math.abs(view.panel.width - want) > 1; pass++) {
                const before = Math.round(view.panel.width);
                const r = await client.send('Emulation.setDeviceMetricsOverride', {
                    width: Math.max(1, Math.round(want + view.chrome)),
                    height: Math.round(view.height) || 900,
                    deviceScaleFactor: 0,
                    mobile: false,
                });
                if (r && r.error) throw new Error(`the workbench refused a viewport override: ${r.error.message}`);
                await new Promise((s) => setTimeout(s, SETTLE_MS));
                view = await look();
                stuck = Math.round(view.panel.width) === before ? stuck + 1 : 0;
                if (stuck >= 2) break;
            }
        }
    } finally {
        client.close();
    }
    return { ...(await readWidth(panel, port)), from };
}
