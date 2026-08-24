/* What every command prints when it is done.

   This is the tool an agent meets once, so the last thing it says is what to do
   next. The panel width is part of that answer - it decides which bugs can
   reproduce at all - so it is reported even when nobody asked for one. */

import { readWidth } from './measure.mjs';
import { setWidth } from './width.mjs';

/* Every run ends by saying what to do next: this is the tool an agent meets
   once, and the commands that follow `up` are the whole working loop. The panel
   width is part of that answer - it decides which bugs can reproduce at all, so
   it is reported even when nobody asked for one. */
export const makeReport = ({ lay, port, version, log, flags }) => async function report(panel, want = flags.width) {
    const asked = want === undefined ? undefined : Number(want);
    const w = asked === undefined ? await readWidth(panel, port) : await setWidth(port, panel, asked);
    const panelWidth = w.inner;
    /* Three stories that used to print as one: the layout refusing the width, the
       panel not having caught up with it yet, and the drag never landing at all.
       Only a width that was *not* delivered is worth a word - a panel already at
       the size asked for needs no drag, and `moved` is false for that too. */
    if (!w.settled) {
        log(`the panel still measures ${w.inner}px while the window has it at ${w.outer}px - it is not on screen, so it has not been laid out again yet`);
    } else if (asked !== undefined && panelWidth !== asked) {
        const away = w.moved && Math.abs(panelWidth - asked) > Math.abs(w.from - asked);
        log(!w.moved
            ? `the sash drag did not move the panel at all, so it is still ${panelWidth}px`
            : away
              ? `the drag moved the panel the wrong way, ${w.from}px -> ${panelWidth}px, asking for ${asked}px`
                + ' - the only sash beside it collapses the side bar instead of resizing it'
              : `panel is ${panelWidth}px, not the ${asked}px asked for - the editor clamps to what the layout allows`);
    }
    console.log(JSON.stringify({ port, version, window: panel.window, panelWidth, windowWidth: w.outer, target: panel.target.id, dir: lay.dir }, null, 1));
    log('edit a patch, then: lab.mjs repatch  |  inspect: lab.mjs eval <script.js>  |  narrow it: lab.mjs width 300');
};
