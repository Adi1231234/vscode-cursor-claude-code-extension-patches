/* The queue panel, above the composer: the pending items, with per-row reorder,
   edit and remove, and a header with pause/resume and clear.

   Everything DOM happens inside the patch init (deferred to DOM-ready) and on
   every __ccWatch batch, never at eval time - an eval-time injection is wiped
   by the app's first render (that is why the style and panel went missing on
   the real app while the deferred usage line survived). The observer handler is
   registered first and the whole sync is guarded, so one bad render can never
   stop the panel from re-attaching. All nodes are owned, so our writes are not
   fed back to us. */
(function () {
    var STYLE_ID = "ccd-queue-style";
    var panel = null, rowsEl = null, titleEl = null, pauseBtn = null;

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        var css =
            ".ccd-q{margin:0 0 6px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);" +
            "border-radius:var(--cds-radius,8px);font:400 12px/1.4 inherit;overflow:hidden}" +
            ".ccd-q[hidden]{display:none}" +
            ".ccd-q-head{display:flex;align-items:center;gap:8px;padding:4px 8px;" +
            "color:color-mix(in srgb,currentColor 60%,transparent)}" +
            ".ccd-q-title{flex:1;font-weight:500}" +
            ".ccd-q-rows{display:flex;flex-direction:column;max-height:40vh;overflow-y:auto}" +
            ".ccd-q-row{display:flex;align-items:center;gap:6px;padding:3px 8px;" +
            "border-top:1px solid color-mix(in srgb,currentColor 8%,transparent)}" +
            ".ccd-q-row:hover{background:color-mix(in srgb,currentColor 7%,transparent)}" +
            ".ccd-q-num{flex:0 0 auto;font-variant-numeric:tabular-nums;" +
            "color:color-mix(in srgb,currentColor 45%,transparent)}" +
            ".ccd-q-text{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
            ".ccd-q-btn{flex:0 0 auto;cursor:pointer;border:0;background:none;padding:2px 5px;" +
            "border-radius:4px;font:inherit;line-height:1;color:color-mix(in srgb,currentColor 55%,transparent)}" +
            ".ccd-q-btn:hover{background:color-mix(in srgb,currentColor 12%,transparent);" +
            "color:color-mix(in srgb,currentColor 85%,transparent)}" +
            ".ccd-q.paused .ccd-q-title::after{content:' (paused)';opacity:.7}";
        var st = document.createElement("style");
        st.id = STYLE_ID;
        st.textContent = css;
        __ccDom.own(st);
        (document.head || document.documentElement).appendChild(st);
    }

    function mkBtn(text, act, idx) {
        var b = document.createElement("button");
        b.className = "ccd-q-btn";
        b.type = "button";
        b.textContent = text;
        b.setAttribute("data-act", act);
        if (idx != null) b.setAttribute("data-i", String(idx));
        return b;
    }

    function onClick(e) {
        var b = e.target.closest ? e.target.closest(".ccd-q-btn") : null;
        if (!b) return;
        e.preventDefault();
        var act = b.getAttribute("data-act");
        var i = parseInt(b.getAttribute("data-i"), 10);
        if (act === "pause") __ccq.setPaused(!__ccq.paused());
        else if (act === "clear") __ccq.clear();
        else if (act === "up") __ccq.move(i, -1);
        else if (act === "down") __ccq.move(i, 1);
        else if (act === "del") __ccq.removeAt(i);
        else if (act === "edit") { var t = __ccq.list()[i]; __ccq.removeAt(i); if (t) { __ccq.composer.clear(); __ccq.composer.insert(t); } }
    }

    function build() {
        panel = document.createElement("div");
        panel.className = "ccd-q";
        __ccDom.own(panel);
        var head = document.createElement("div");
        head.className = "ccd-q-head";
        titleEl = document.createElement("span");
        titleEl.className = "ccd-q-title";
        pauseBtn = mkBtn("", "pause");
        head.appendChild(titleEl);
        head.appendChild(pauseBtn);
        head.appendChild(mkBtn("Clear", "clear"));
        rowsEl = document.createElement("div");
        rowsEl.className = "ccd-q-rows";
        panel.appendChild(head);
        panel.appendChild(rowsEl);
        panel.addEventListener("click", onClick);
    }

    function row(text, i, last) {
        var r = document.createElement("div");
        r.className = "ccd-q-row";
        var num = document.createElement("span");
        num.className = "ccd-q-num";
        num.textContent = (i + 1) + ".";
        var tx = document.createElement("span");
        tx.className = "ccd-q-text";
        tx.textContent = text;
        tx.title = text;
        r.appendChild(num);
        r.appendChild(tx);
        if (i > 0) r.appendChild(mkBtn("↑", "up", i));
        if (!last) r.appendChild(mkBtn("↓", "down", i));
        r.appendChild(mkBtn("✎", "edit", i));
        r.appendChild(mkBtn("✕", "del", i));
        return r;
    }

    function render() {
        if (!panel) build();
        var items = __ccq.list();
        __ccDom.toggle(panel, "paused", __ccq.paused());
        __ccDom.setText(pauseBtn, __ccq.paused() ? "▶ Resume" : "⏸ Pause");
        __ccDom.setText(titleEl, "Queue · " + items.length);
        panel.hidden = items.length === 0;
        rowsEl.textContent = "";
        for (var i = 0; i < items.length; i++) rowsEl.appendChild(row(items[i], i, i === items.length - 1));
    }

    function sync() {
        try {
            ensureStyle();
            if (!panel) build();
            var composer = document.querySelector('[data-cds="ChatComposer"]');
            if (composer && panel.parentElement !== composer) composer.insertBefore(panel, composer.firstChild);
            render();
        } catch (e) { window.__ccd.log("queue panel sync failed:", e && e.message); }
    }

    window.__ccd.patch("prompt-queue-panel", function () {
        __ccWatch.on(sync);        // registered first, so a bad render never stops re-attach
        __ccq.onChange(sync);
        sync();
        setTimeout(sync, 400);     // backstop if the composer mounts just after init
    });
})();
