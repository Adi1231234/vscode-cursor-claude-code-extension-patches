/* The overflow menu itself: a menuPopup hung from the overflow button's own
   box, the way the app's "+" hangs its list. It opens on a click and closes on
   a pick, on Escape (focus back on the button), on a press anywhere outside and
   on a resize - which re-runs the fit, so what is folded may change under it.
   Picking a row clicks the real button, so every folded control keeps the one
   handler it already has. */
var __ccFoldMenu = (function () {
    var open = null;

    /* The app's own popups do this (its footer tooltip): a popup that would
       start left of the page is moved to start at its edge. Narrower than the
       menu's 180px minimum, the page also caps its width. Both are rects, so
       both are in the body's zoomed units - see the zoom note in CLAUDE.md. */
    function clamp(pop, wrap) {
        var page = document.body.getBoundingClientRect();
        if (pop.getBoundingClientRect().width > page.width) {
            pop.style.minWidth = "0";
            pop.style.width = page.width + "px";
        }
        if (pop.getBoundingClientRect().left < page.left) {
            pop.style.right = "auto";
            pop.style.left = page.left - wrap.getBoundingClientRect().left + "px";
        }
    }

    function close(refocus) {
        if (!open) return;
        var o = open;
        open = null;
        if (o.pop.parentNode) o.pop.parentNode.removeChild(o.pop);
        o.btn.setAttribute("aria-expanded", "false");
        document.removeEventListener("mousedown", onPress, true);
        document.removeEventListener("keydown", onKey, true);
        window.removeEventListener("resize", onResize);
        if (refocus) o.btn.focus();
    }

    function onPress(ev) {
        if (open && !open.btn.parentNode.contains(ev.target)) close(false);
    }

    function onKey(ev) {
        if (ev.key !== "Escape") return;
        ev.preventDefault();
        ev.stopPropagation();
        close(true);
    }

    function onResize() {
        close(false);
    }

    function pick(node) {
        close(false);
        node.click();
    }

    function toggle(btn, css, byKeyboard) {
        var again = open && open.btn === btn;
        close(false);
        if (again) return;
        var rows = __ccFoldItems(btn.closest("[data-fit-stage]"), css, pick);
        if (!rows.length) return;
        var pop = document.createElement("div");
        pop.className = css.menuPopup;
        /* An overlay to the app's fitter and ours to the shared observer, so
           opening the list re-fits nothing and wakes no patch. */
        pop.setAttribute("data-footer-overlay", "");
        pop.setAttribute("data-cc", "");
        for (var i = 0; i < rows.length; i++) pop.appendChild(rows[i]);
        btn.parentNode.appendChild(pop);
        clamp(pop, btn.parentNode);
        btn.setAttribute("aria-expanded", "true");
        open = { btn: btn, pop: pop };
        document.addEventListener("mousedown", onPress, true);
        document.addEventListener("keydown", onKey, true);
        window.addEventListener("resize", onResize);
        if (byKeyboard) pop.firstChild.focus();
    }

    return { toggle: toggle };
})();
