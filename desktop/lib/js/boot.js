/* Desktop renderer bootstrap - runs inside the Code-tab preload (mainView.js),
   which shares the claude.ai page's DOM but is an isolated world with its own
   window. Patches register here and are initialised once, after they have all
   been concatenated in and the DOM exists; ongoing changes are each patch's own
   job via __ccWatch, never a poll. Plain .js written straight into the archive,
   so none of the template-literal escaping hazards of the webview side apply. */
(function () {
    if (typeof document === "undefined") return;   // node-side bundles have no DOM
    if (window.__ccd) return;                       // once per page

    var inits = [];
    window.__ccd = {
        version: "__CCD_VERSION__",
        patch: function (name, fn) { inits.push({ name: name, fn: fn }); },
        log: function () {
            try { console.log.apply(console, ["[ccd]"].concat([].slice.call(arguments))); }
            catch (e) { /* console may be gone during teardown */ }
        },
    };

    function run() {
        try { document.documentElement.setAttribute("data-ccd", window.__ccd.version); }
        catch (e) { /* ignore */ }
        for (var i = 0; i < inits.length; i++) {
            try { inits[i].fn(); }
            catch (e) { window.__ccd.log("patch failed:", inits[i].name, e && e.message); }
        }
        window.__ccd.log("loaded", inits.length, "patch(es), v" + window.__ccd.version);
    }

    // Defer so every patch concatenated after this file has registered first.
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
        setTimeout(run, 0);
    }
})();
