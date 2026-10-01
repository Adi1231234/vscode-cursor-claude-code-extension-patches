/* The rungs this patch adds to the input footer's own fit ladder.

   The footer measures itself whenever its width or its content changes, starting
   from stage 0 and climbing one stage per render while the row does not fit:
   stage 1 turns the Remote Control and agents pills into glyphs, stage 2 moves
   the model pill onto a row of its own. Stage 2 was the top, because upstream's
   own buttons always fit by then. Ours do not - the gear, auto follow-up, saved
   queues and add-to-queue are another 118px - so at stage 2 the row kept
   overflowing: the permission-mode selector (flex-shrink 1, min-width 0) was
   squeezed to nothing and the send button was pushed out of the frame.

   So the ladder goes on past 2, and every rung above it is ours. With k the
   number of rungs above the app's top:

     k = 1          compact - the footer's own narrow form (see fit.css)
     k = 1 + n      compact, and every button whose fold order is <= n folded
                    into the overflow menu (n = 1 .. MAX)
     k = MAX + 2    all of that, and the row wraps - the last resort, for a row
                    whose own buttons do not fit either

   Compact is taken on the app's own word that the row does not fit; every rung
   after it only on a real cut (runtime/cut.js), which an ellipsis is not.

   The app keeps seeing a stage from 0 to 2 (stage() caps it), so the model pill
   and every [data-fit-stage] rule behave exactly as they did; the rungs reach
   the page as data-cc-fit on the same element, and fit.css does the rest.
   Nothing here writes to the DOM: the ladder runs inside the app's layout
   effect, which measures straight after each render, and an attribute that
   render wrote is already styled by the time it measures. */
var __ccFold = window.__ccFold = window.__ccFold || (function () {
    /* The app's own top stage. */
    var TOP = 2;

    /* The highest fold order fit.css has a rule for. The orders themselves are
       declared by the buttons (data-cc-fold) - see the table in the README. */
    var MAX = 5;

    var COMPACT = 1;
    var WRAP = MAX + 2;

    /* Fold orders of the buttons in a footer row right now, folded or not. A
       rung for an order nobody has would be a render that changes nothing, so
       next() steps over it. */
    function present() {
        var out = [];
        var nodes = document.querySelectorAll("[data-fit-stage] [data-cc-fold]");
        for (var i = 0; i < nodes.length; i++) {
            var n = parseInt(nodes[i].getAttribute("data-cc-fold"), 10);
            if (n >= 1 && n <= MAX && out.indexOf(n) < 0) out.push(n);
        }
        return out;
    }

    function anyCut() {
        var rows = document.querySelectorAll("[data-fit-stage]");
        for (var i = 0; i < rows.length; i++) {
            if (__ccFoldCut(rows[i])) return true;
        }
        return false;
    }

    /* Called by the app's fitter in place of its own `case 2: return 2`, i.e.
       only at stage >= 2 and only while the row does not fit by its measure. */
    function next(stage) {
        var k = stage - TOP;
        if (k >= WRAP) return stage;
        if (k < COMPACT) return TOP + COMPACT;
        if (!anyCut()) return stage;
        var n = k - COMPACT, orders = present(), best = 0;
        for (var i = 0; i < orders.length; i++) {
            if (orders[i] > n && (!best || orders[i] < best)) best = orders[i];
        }
        return TOP + (best ? COMPACT + best : WRAP);
    }

    /* The stage the app itself renders from. */
    function stage(s) {
        return Math.min(s, TOP);
    }

    /* The rungs taken at stage s, as data-cc-fit tokens: "compact fold-1 fold-2"
       at k = 3. undefined - the attribute left off altogether - below them. */
    function rungs(s) {
        var k = s - TOP, out = [];
        if (k >= COMPACT) out.push("compact");
        for (var i = 1; i <= Math.min(k - COMPACT, MAX); i++) out.push("fold-" + i);
        if (k >= WRAP) out.push("wrap");
        return out.length ? out.join(" ") : undefined;
    }

    return { next: next, stage: stage, rungs: rungs };
})();
