/* zoom (desktop): Ctrl + mouse-wheel (and trackpad pinch, which Chromium
   delivers as ctrl+wheel) to zoom the conversation.

   Only the session content - the conversation, the composer, and the line
   below it (usage, mode) - grows. Not the sidebar, not the title bar. So this
   does NOT use the app's native (webFrame) zoom, which scales the whole window
   and is one level for the whole app (Chromium keeps it per origin). It sets
   CSS `zoom` on the one element that wraps the conversation and the composer:
   the scroll column just below the title bar. Measured on the live page - it
   is the child of the element carrying the `--titlebar-end-inset` custom
   property, and it holds the composer, the send cell and the usage line;
   zooming it enlarges all of them and leaves the title bar and the sidebar
   untouched, with no horizontal scroll (CSS `zoom` reflows, so the column's
   own box stays and its content scales inside).

   Per conversation: the level is stored per session id and re-applied when the
   conversation on screen changes (desktop/lib/js/session.js) and whenever the
   app rebuilds that column (ccWatch). A conversation with no saved level sits
   at the base (0 = 1x). This matches what the VS Code panel already does. */
(function () {
    var PREFIX = "ccd.zoom.", MIN = -3, MAX = 5, STEP = 0.5, BASE = 1.2;

    function keyFor(sid) { return PREFIX + (sid || "new"); }
    function sid() { return window.__ccdSessions ? window.__ccdSessions.current() : null; }

    /* The conversation + composer column: the composer's ancestor whose parent
       carries the title bar (the --titlebar-end-inset property). */
    function contentCol() {
        var inp = document.querySelector('[data-testid="code-prompt-input"]');
        for (var n = inp; n && n.parentElement; n = n.parentElement) {
            if ((n.parentElement.className || "").indexOf("--titlebar-end-inset") >= 0) return n;
        }
        return null;
    }

    function savedLevel(id) {
        try {
            var v = localStorage.getItem(keyFor(id));
            if (v != null && v !== "") return Math.max(MIN, Math.min(MAX, parseFloat(v)));
        } catch (e) {}
        return 0;
    }

    /* Set the current conversation's zoom on the column, only when it differs
       (an unchanged write is still a mutation that would wake the observer). */
    function apply() {
        var col = contentCol();
        if (!col) return;
        var want = String(Math.pow(BASE, savedLevel(sid())));
        if (col.style.zoom !== want) col.style.zoom = want;
    }

    window.__ccd.patch("zoom", function () {
        apply();
        if (window.__ccdSessions) window.__ccdSessions.onCurrent(apply);
        /* Re-apply when the app rebuilds the column (a switch, a view change). */
        if (window.__ccWatch) window.__ccWatch.on(apply);

        window.addEventListener("wheel", function (e) {
            if (!e.ctrlKey) return;
            e.preventDefault();
            var id = sid();
            var lv = Math.max(MIN, Math.min(MAX, savedLevel(id) + (e.deltaY < 0 ? STEP : -STEP)));
            try { localStorage.setItem(keyFor(id), String(lv)); } catch (x) { /* private mode */ }
            apply();
        }, { passive: false, capture: true });
    });
})();
