/* The overflow button - where the folded buttons go.

   Rendered by the footer itself, from inside its own render, right before the
   send button, and rendered ALWAYS: fit.css shows it only while a fold rung is
   on the row. Mounting it on demand would be a childList change in the row,
   which the fitter answers by starting over from stage 0 - where nothing is
   folded, so it would unmount again, and so on.

   It is the twin of the app's "+" at the other end of the row: the same
   addButton addButtonSquare, opening the same menuPopup of menuItem rows
   (runtime/menu.js), all read off the app's own CSS-module map at runtime, so
   it follows whatever upstream does to its menu. data-cc-tail tells
   lib/js/ccRow.js that the buttons other patches place go in front of it. */
(function (fold) {
    /* Three dots on the row's own signature (see panel-settings' gear): a
       20-unit box, the glyph spanning 4.4 to 15.6 like the "/" and the gear. */
    var DOTS = "M6.6 10A1.1 1.1 0 1 1 4.4 10A1.1 1.1 0 1 1 6.6 10Z" +
        "M11.1 10A1.1 1.1 0 1 1 8.9 10A1.1 1.1 0 1 1 11.1 10Z" +
        "M15.6 10A1.1 1.1 0 1 1 13.4 10A1.1 1.1 0 1 1 15.6 10Z";

    function glyph(h) {
        return h("svg", {
            width: "20", height: "20", viewBox: "0 0 20 20", fill: "none",
            xmlns: "http://www.w3.org/2000/svg", style: { display: "block" },
            children: h("path", { d: DOTS, fill: "currentColor" })
        });
    }

    /* h is the bundle's jsx factory, css the "+" module's class map. */
    fold.more = function (h, css) {
        return h("div", {
            className: "cc-more",
            "data-cc-tail": "",
            children: h("button", {
                type: "button",
                className: css.addButton + " " + css.addButtonSquare,
                title: "More actions",
                "aria-label": "More actions",
                "aria-haspopup": "true",
                "aria-expanded": "false",
                onClick: function (ev) {
                    ev.preventDefault();
                    __ccFoldMenu.toggle(ev.currentTarget, css, ev.detail === 0);
                },
                children: glyph(h)
            })
        });
    };

    /* What a folded button's own popup should hang from: the overflow button,
       the one thing on screen that stands for it (auto follow-up's menu). */
    fold.standIn = function (node) {
        if (!node || node.getClientRects().length) return node;
        var row = node.closest("[data-fit-stage]");
        var more = row && row.querySelector(".cc-more > button");
        return more && more.getClientRects().length ? more : node;
    };
})(__ccFold);
