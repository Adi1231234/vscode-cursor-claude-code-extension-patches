/* The overflow menu's rows: one per button folded out of the row, in the order
   they stand in it, each wearing the app's own menuItem / menuItemIcon /
   menuItemLabel and carrying the folded button's glyph and name. */
var __ccFoldItems = (function () {
    /* Folded right now: the row's own fold-able buttons that have no box. */
    function foldedIn(row) {
        var out = [], nodes = row ? row.querySelectorAll("[data-cc-fold]") : [];
        for (var i = 0; i < nodes.length; i++) {
            if (!nodes[i].getClientRects().length) out.push(nodes[i]);
        }
        return out;
    }

    /* The glyph at the size it has in the row. Some of those sizes come from a
       stylesheet rule the copy is no longer under (the saved-queues book has no
       size of its own), so it is read off the original - a folded button is
       display:none, but its computed width is still the rule's. fit.css caps
       it at the app's own menu-icon box. */
    function icon(node) {
        var svg = node.querySelector("svg");
        if (!svg) return null;
        var copy = svg.cloneNode(true);
        var px = parseFloat(getComputedStyle(svg).width);
        if (px > 0) {
            copy.setAttribute("width", px);
            copy.setAttribute("height", px);
        }
        return copy;
    }

    function item(node, css, pick) {
        var it = document.createElement("button");
        it.type = "button";
        it.className = css.menuItem;
        var ic = document.createElement("span");
        ic.className = css.menuItemIcon + " cc-more-icon";
        var svg = icon(node);
        if (svg) ic.appendChild(svg);
        var label = document.createElement("span");
        label.className = css.menuItemLabel;
        label.textContent = node.getAttribute("aria-label") || node.getAttribute("title") || "";
        it.appendChild(ic);
        it.appendChild(label);
        it.addEventListener("click", function (ev) {
            ev.preventDefault();
            pick(node);
        });
        return it;
    }

    /* pick(node) runs when a row is chosen, with the folded button it stands for. */
    return function (row, css, pick) {
        var nodes = foldedIn(row), out = [];
        for (var i = 0; i < nodes.length; i++) out.push(item(nodes[i], css, pick));
        return out;
    };
})();
