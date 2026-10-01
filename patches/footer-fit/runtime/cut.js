/* Whether the footer row has something really cut - by this patch's measure,
   not the app's.

   The app's fitter counts any clipped box as a row that does not fit, a text
   label ellipsised below its max-width included. Its ladder stopped at stage 2,
   so that never cost more than an ellipsis. Ours goes on, and by the app's
   measure a long file name in the selection chip folded every button of ours
   and then wrapped the row: measured with "ConversationHistoryPanel.tsx" open,
   all five folded at 480px and the footer was two lines from 460px down - in a
   panel where that name, ellipsised, fits on one line beside every button.

   An ellipsis is a label doing what it was built to do. So past the app's own
   stages a rung is taken only for a real cut: the row running past its own box,
   a box cut short of its content (a glyph pushed out of a squeezed button), or
   a label squeezed under FLOOR_EM - about four characters and the ellipsis,
   below which a file name stops reading as one. Measured the way the app
   measures: in-flow boxes only, nothing inside an absolute one, and a box that
   carries a [data-footer-overlay] (its tooltip) left out. */
var __ccFoldCut = (function () {
    var FLOOR_EM = 4;

    function floating(el, row, win) {
        for (var n = el; n && n !== row; n = n.parentElement) {
            var p = win.getComputedStyle(n).position;
            if (p === "absolute" || p === "fixed") return true;
        }
        return false;
    }

    function tooShort(el, win) {
        var s = win.getComputedStyle(el);
        if (s.textOverflow !== "ellipsis") return true;
        return el.clientWidth < FLOOR_EM * parseFloat(s.fontSize);
    }

    return function (row) {
        if (row.scrollWidth - row.clientWidth > 1) return true;
        var win = row.ownerDocument.defaultView;
        var all = row.querySelectorAll("*");
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            if (!(el instanceof win.HTMLElement)) continue;
            if (el.scrollWidth - el.clientWidth <= 1) continue;
            if (el.querySelector(":scope > [data-footer-overlay]")) continue;
            if (floating(el, row, win)) continue;
            if (tooShort(el, win)) return true;
        }
        return false;
    };
})();
