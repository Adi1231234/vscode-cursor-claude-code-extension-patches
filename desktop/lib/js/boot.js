/* Desktop renderer bootstrap - runs inside the Code-tab preload (mainView.js),
   which shares the claude.ai page's DOM but is an isolated world with its own
   window. Patches register here and are initialised once, after they have all
   been concatenated in and the DOM exists; ongoing changes are each patch's own
   job via __ccWatch, never a poll. Plain .js written straight into the archive,
   so none of the template-literal escaping hazards of the webview side apply. */
(function () {
    if (typeof document === "undefined") return;   // node-side bundles have no DOM
    if (window.__ccd) return;                       // once per page

    var inits = [], styles = [];

    /* A stylesheet put in at load is gone after the app's first render, and the
       app may re-render the head again later: each one is put back on every
       DOM change it makes, and only when it is missing. */
    function ensureStyles() {
        for (var i = 0; i < styles.length; i++) {
            var id = "ccd-css-" + styles[i].id;
            if (document.getElementById(id)) continue;
            var st = document.createElement("style");
            st.id = id;
            st.textContent = styles[i].css;
            window.__ccDom.own(st);
            (document.head || document.documentElement).appendChild(st);
        }
    }

    window.__ccd = {
        version: "__CCD_VERSION__",
        patch: function (name, fn) { inits.push({ name: name, fn: fn }); },
        /* A patch's stylesheet; the build turns each .css file into one call. */
        style: function (id, css) { styles.push({ id: id, css: css }); },
        log: function () {
            try { console.log.apply(console, ["[ccd]"].concat([].slice.call(arguments))); }
            catch (e) { /* console may be gone during teardown */ }
        },
    };

    function run() {
        try { document.documentElement.setAttribute("data-ccd", window.__ccd.version); }
        catch (e) { /* ignore */ }
        ensureStyles();
        window.__ccWatch.on(ensureStyles);
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
