/* zoom (desktop): Ctrl + mouse-wheel (and trackpad pinch, which Chromium
   delivers as ctrl+wheel) to zoom the Code tab. The app already has the
   Ctrl +/- / 0 menu items; this adds the wheel gesture the parent `zoom` patch
   gives the webview.

   It drives Electron's own zoom via webFrame (captured at preload-eval time,
   when `require` is available), the same level the menu uses - so, unlike CSS
   `zoom`, it does not split the viewport from the layout coordinates and needs
   no follow-up fixes. If webFrame is ever unavailable it falls back to CSS
   `body.zoom`. The level is persisted best-effort and re-applied on load. */
(function () {
    var webFrame = null;
    try { webFrame = require("electron").webFrame; } catch (e) { webFrame = null; }

    var KEY = "ccd.zoom.level";
    var MIN = -3, MAX = 5, STEP = 0.5, BASE = 1.2;

    function getLevel() {
        if (webFrame) return webFrame.getZoomLevel();
        var z = parseFloat(document.body && document.body.style.zoom) || 1;
        return Math.round(Math.log(z) / Math.log(BASE));
    }
    function setLevel(lv) {
        lv = Math.max(MIN, Math.min(MAX, lv));
        if (webFrame) webFrame.setZoomLevel(lv);
        else if (document.body) document.body.style.zoom = String(Math.pow(BASE, lv));
        try { localStorage.setItem(KEY, String(lv)); } catch (e) { /* private mode */ }
        return lv;
    }

    window.__ccd.patch("zoom", function () {
        try {
            var saved = localStorage.getItem(KEY);
            if (saved != null && saved !== "") setLevel(parseFloat(saved));
        } catch (e) { /* ignore */ }

        window.addEventListener("wheel", function (e) {
            if (!e.ctrlKey) return;
            e.preventDefault();
            setLevel(getLevel() + (e.deltaY < 0 ? STEP : -STEP));
        }, { passive: false, capture: true });
    });
})();
