/* The overflow menu's rows: one per item folded out of the row, in the order
   they stand in it, each wearing the app's own menuItem / menuItemIcon /
   menuItemLabel and carrying the folded item's glyph and name. */
var __ccFoldItems = (function () {
    /* Folded right now: the row's fold-able items that have no box. */
    function foldedIn(row) {
        var out = [], nodes = row ? __ccFold.foldable(row) : [];
        for (var i = 0; i < nodes.length; i++) {
            if (!nodes[i].getClientRects().length) out.push(nodes[i]);
        }
        return out;
    }

    /* The app's status items are not always the control themselves: the cache
       clock is a box around a labelled status span, with nothing to click. */
    function named(node) {
        if (node.hasAttribute("aria-label")) return node;
        return node.querySelector("[aria-label]") || node;
    }

    function target(node) {
        if (node.matches("button, a")) return node;
        return node.querySelector("button, a");
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
        /* Up to the first " · ": the agents pill's name is "1 agent · Agents are
           working · Click to open the agent map", three lines in a narrow menu,
           and the row is already the click it describes. */
        var src = named(node);
        var name = src.getAttribute("aria-label") || src.getAttribute("title") || "";
        label.textContent = name.split(" · ")[0];
        it.appendChild(ic);
        it.appendChild(label);
        /* A status with nothing behind it (the cache clock) still shows its
           sentence, as a disabled row - the app's menuItem styles :disabled. */
        var to = target(node);
        if (!to) {
            it.disabled = true;
            return it;
        }
        it.addEventListener("click", function (ev) {
            ev.preventDefault();
            pick(to);
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
