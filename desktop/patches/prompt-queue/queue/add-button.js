/* The add-to-queue button, a quiet ghost button just left of Send, as in the
   VS Code queue. Its look is the app's own: it copies the class list and the
   data-cds attributes of the sibling ghost icon button already in the row (the
   microphone), so nothing is hand-picked and a restyle of the app carries over.
   Click = the same commit as Alt+Enter (__ccq.commitDraft). A styled tooltip,
   not a native title, names the shortcut. The row is re-rendered by the app, so
   the button is re-placed on every __ccWatch batch; moving an owned node is
   filtered by __ccWatch, so placing it never wakes anyone. */
(function () {
    var ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M4 7h12"/><path d="M4 12h12"/><path d="M4 17h7"/><path d="M17.5 14v7"/><path d="M14 17.5h7"/></svg>';
    var STYLE_ID = "ccd-qadd-style";
    var btn = null;

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        var st = document.createElement("style");
        st.id = STYLE_ID;
        st.textContent =
            ".ccd-qadd{position:relative;display:inline-flex;align-items:center;justify-content:center}" +
            ".ccd-qadd-tip{display:none;position:absolute;bottom:calc(100% + 6px);right:0;white-space:nowrap;" +
            "align-items:center;gap:6px;padding:4px 8px;border-radius:6px;font:400 12px/1.3 inherit;" +
            "background:var(--cds-color-surface-inverse,#222);color:var(--cds-color-text-inverse,#fff);" +
            "pointer-events:none;z-index:50}" +
            ".ccd-qadd-tip kbd{font:inherit;opacity:.7}" +
            ".ccd-qadd:hover .ccd-qadd-tip,.ccd-qadd:focus-visible .ccd-qadd-tip{display:inline-flex}";
        __ccDom.own(st);
        (document.head || document.documentElement).appendChild(st);
    }

    function mirror(b, row) {
        var sib = row.querySelector('button[data-cds-icon-only]:not(.ccd-qadd)');
        if (!sib) return;
        b.className = sib.className + " ccd-qadd";
        for (var i = 0; i < sib.attributes.length; i++) {
            var a = sib.attributes[i];
            if (a.name.indexOf("data-cds") === 0) b.setAttribute(a.name, a.value);
        }
    }

    function build(row) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "ccd-qadd";
        mirror(b, row);
        b.setAttribute("aria-label", "Add to queue (Alt+Enter)");
        b.innerHTML = ICON + '<span class="ccd-qadd-tip" aria-hidden="true">Add to queue <kbd>Alt+Enter</kbd></span>';
        __ccDom.own(b);
        b.addEventListener("mousedown", function (e) { e.preventDefault(); });   // keep the editor's focus
        b.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (__ccq.commitDraft()) { var i = __ccq.composer.input(); if (i) i.focus(); }
        });
        return b;
    }

    function place() {
        var row = document.querySelector('[data-testid="code-prompt-trailing-controls"]');
        if (!row) return;
        if (!btn) btn = build(row);
        var cell = row.querySelector('[data-testid="code-prompt-send-cell"]');
        var anchor = cell && cell.parentElement === row ? cell : row.firstChild;
        if (btn.parentElement === row && btn.nextSibling === anchor) return;
        row.insertBefore(btn, anchor);
    }

    window.__ccd.patch("prompt-queue-add-button", function () {
        ensureStyle();
        __ccWatch.on(place);
        place();
    });
})();
