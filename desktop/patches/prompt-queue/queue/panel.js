/* The queue panel, above the composer: the pending items, with per-row reorder,
   edit and remove, and a header with pause/resume and clear. All nodes are owned
   (__ccDom.own) so the shared observer ignores our own writes, and the panel
   re-attaches itself if the composer remounts on navigation. */
(function () {
    var panel = null, rowsEl = null, titleEl = null, pauseBtn = null;

    function build() {
        panel = document.createElement("div");
        panel.className = "ccd-q";
        __ccDom.own(panel);
        var head = document.createElement("div");
        head.className = "ccd-q-head";
        titleEl = document.createElement("span");
        titleEl.className = "ccd-q-title";
        pauseBtn = mkBtn("", "pause");
        var clearBtn = mkBtn("Clear", "clear");
        head.appendChild(titleEl);
        head.appendChild(pauseBtn);
        head.appendChild(clearBtn);
        rowsEl = document.createElement("div");
        rowsEl.className = "ccd-q-rows";
        panel.appendChild(head);
        panel.appendChild(rowsEl);
        panel.addEventListener("click", onClick);
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
        __ccDom.setAttr(pauseBtn, "data-act", "pause");
        __ccDom.setText(pauseBtn, __ccq.paused() ? "▶ Resume" : "⏸ Pause");
        __ccDom.setText(titleEl, "Queue · " + items.length);
        panel.hidden = items.length === 0;
        rowsEl.textContent = "";
        for (var i = 0; i < items.length; i++) rowsEl.appendChild(row(items[i], i, i === items.length - 1));
    }

    function attach() {
        var composer = document.querySelector('[data-cds="ChatComposer"]');
        if (!composer) return;
        if (!panel) build();
        if (panel.parentElement !== composer) composer.insertBefore(panel, composer.firstChild);
    }

    window.__ccd.patch("prompt-queue-panel", function () {
        attach();
        render();
        __ccq.onChange(render);
        __ccWatch.on(function () { attach(); });
    });
})();
