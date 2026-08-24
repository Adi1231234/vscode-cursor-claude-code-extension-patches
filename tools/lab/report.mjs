/* What every command prints when it is done.

   This is the tool an agent meets once, so the last thing it says is what to do
   next. The panel width is part of that answer - it decides which bugs can
   reproduce at all - so it is reported even when nobody asked for one. */

import { readWidth } from './measure.mjs';
import { setWidth } from './width.mjs';

/* The viewport route has one way to fall short: the workbench would not lay the
   panel out at the width the arithmetic asked for. Say that, and say what it did
   settle on - there is no sash left to blame. */
const explainWidth = (w, got, asked) =>
    `the workbench settled the panel at ${got}px rather than the ${asked}px asked for`
    + (w.from !== null && w.from !== got ? ` (it was ${w.from}px)` : '')
    + ' - that is its own minimum or maximum for this layout';

export const makeReport = ({ lay, port, version, log, flags }) => async function report(panel, want = flags.width) {
    const asked = want === undefined ? undefined : Number(want);
    const w = asked === undefined ? await readWidth(panel, port) : await setWidth(port, panel, asked);
    const panelWidth = w.inner;
    /* Only a width that was not delivered is worth a word, and a stale reading is
       a different story from a refused one. */
    if (!w.settled) {
        log(`the panel still measures ${w.inner}px while the window has it at ${w.outer}px - it is not on screen, so it has not been laid out again yet`);
    } else if (asked !== undefined && panelWidth !== asked) {
        log(explainWidth(w, panelWidth, asked));
    }
    console.log(JSON.stringify({ port, version, window: panel.window, panelWidth, windowWidth: w.outer, target: panel.target.id, dir: lay.dir }, null, 1));
    log('edit a patch, then: lab.mjs repatch  |  inspect: lab.mjs eval <script.js>  |  narrow it: lab.mjs width 300');
};
