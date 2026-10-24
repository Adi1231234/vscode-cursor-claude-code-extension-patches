/* input-usage (desktop): a thin line at the very bottom of the composer showing
   how much of the usage window is left.

   The Code app already knows the figure - it is on the usage button's
   aria-label ("Usage: Weekly - all models: 60%, Resets Wed 8:00 PM") - but the
   button is icon-only, so the number is never on screen. We read that label and
   render it as a small line plus a bar, in the composer, using the current text
   colour (no hardcoded colour, so it follows the theme).

   Usage only changes at a turn's end, which is a DOM change (the Stop button
   leaves the send cell), so we re-read on each __ccWatch batch rather than poll;
   every write goes through __ccDom and lands only on a real change. */
window.__ccd.patch("input-usage", function () {
    var STYLE_ID = "ccd-usage-style";
    if (!document.getElementById(STYLE_ID)) {
        var st = document.createElement("style");
        st.id = STYLE_ID;
        st.textContent =
            ".ccd-usage{display:flex;align-items:center;gap:6px;width:100%;" +
            "padding:1px var(--cmp-pad-x,.5rem) 3px;font:400 11px/1.4 inherit;" +
            "color:color-mix(in srgb,currentColor 58%,transparent);user-select:none}" +
            ".ccd-usage-track{flex:0 0 44px;height:3px;border-radius:2px;position:relative;" +
            "background:color-mix(in srgb,currentColor 18%,transparent)}" +
            ".ccd-usage-fill{position:absolute;inset:0 auto 0 0;border-radius:2px;" +
            "background:color-mix(in srgb,currentColor 55%,transparent)}";
        __ccDom.own(st);
        (document.head || document.documentElement).appendChild(st);
    }

    var els = null;
    function ensure() {
        var composer = document.querySelector('[data-cds="ChatComposer"]');
        if (!composer) return null;
        if (els && els.line.isConnected && els.line.parentElement === composer) return els;
        var line = document.createElement("div");
        line.className = "ccd-usage";
        __ccDom.own(line);
        var txt = document.createElement("span");
        var track = document.createElement("span");
        track.className = "ccd-usage-track";
        var fill = document.createElement("span");
        fill.className = "ccd-usage-fill";
        track.appendChild(fill);
        line.appendChild(txt);
        line.appendChild(track);
        composer.appendChild(line);
        els = { line: line, txt: txt, fill: fill };
        return els;
    }

    function parse() {
        var btn = document.querySelector('[aria-label^="Usage:"]');
        var label = btn && btn.getAttribute("aria-label");
        if (!label) return null;
        var pct = (label.match(/(\d+)%/) || [])[1];
        var reset = (label.match(/Resets?\s+(.+?)\s*$/i) || [])[1];
        var scope = (label.match(/Usage:\s*([^·:,]+)/i) || [])[1];
        return { pct: pct, reset: reset && reset.trim(), scope: scope && scope.trim() };
    }

    function update() {
        var u = parse();
        var e = ensure();
        if (!e) return;
        if (!u || u.pct == null) { __ccDom.setStyle(e.line, "display", "none"); return; }
        __ccDom.setStyle(e.line, "display", "flex");
        __ccDom.setText(e.txt,
            (u.scope ? u.scope + " " : "") + u.pct + "%" + (u.reset ? " · resets " + u.reset : ""));
        __ccDom.setStyle(e.fill, "width", Math.min(100, +u.pct) + "%");
    }

    update();
    __ccWatch.on(update, { chars: true });
});
