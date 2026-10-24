/* zoom (desktop): Ctrl + mouse-wheel (and trackpad pinch, which Chromium
   delivers as ctrl+wheel) to zoom the Code tab.

   Per conversation, not per app. The app's own zoom (and Electron's webFrame
   zoom, which the menu's Ctrl +/- uses) is one level for the whole app -
   Chromium keeps it per origin, so every Claude window zooms together. The
   person wants each conversation to keep its own zoom, the way the VS Code
   panel already does. So the level is stored per session id and re-applied
   whenever the conversation on screen changes (desktop/lib/js/session.js):
   switch to a conversation and its own zoom comes back, Ctrl+wheel changes
   only that one.

   It drives Electron's webFrame zoom (captured at preload-eval time, when
   require is available), the same level the menu uses - so, unlike CSS zoom,
   it does not split the viewport from the layout coordinates. If webFrame is
   unavailable it falls back to CSS body.zoom. A conversation with no saved
   level sits at the base (0 = 1x). */
(function () {
    var webFrame = null;
    try { webFrame = require("electron").webFrame; } catch (e) { webFrame = null; }

    var PREFIX = "ccd.zoom.", MIN = -3, MAX = 5, STEP = 0.5, BASE = 1.2;

    function keyFor(sid) { return PREFIX + (sid || "new"); }

    function getLevel() {
        if (webFrame) return webFrame.getZoomLevel();
        var z = parseFloat(document.body && document.body.style.zoom) || 1;
        return Math.round(Math.log(z) / Math.log(BASE));
    }

    function applyLevel(lv) {
        lv = Math.max(MIN, Math.min(MAX, lv));
        if (webFrame) webFrame.setZoomLevel(lv);
        else if (document.body) document.body.style.zoom = String(Math.pow(BASE, lv));
        return lv;
    }

    /* The level saved for a conversation, or the base when it has none. */
    function savedLevel(sid) {
        try {
            var v = localStorage.getItem(keyFor(sid));
            if (v != null && v !== "") return parseFloat(v);
        } catch (e) {}
        return 0;
    }

    function applyFor(sid) {
        applyLevel(savedLevel(sid));
    }

    window.__ccd.patch("zoom", function () {
        var sessions = window.__ccdSessions;
        var cur = sessions ? sessions.current() : null;
        applyFor(cur);
        /* Re-apply the new conversation's own level on every switch. */
        if (sessions) sessions.onCurrent(function (id) { applyFor(id); });

        window.addEventListener("wheel", function (e) {
            if (!e.ctrlKey) return;
            e.preventDefault();
            var lv = applyLevel(getLevel() + (e.deltaY < 0 ? STEP : -STEP));
            var sid = sessions ? sessions.current() : null;
            try { localStorage.setItem(keyFor(sid), String(lv)); } catch (x) { /* private mode */ }
        }, { passive: false, capture: true });
    });
})();
