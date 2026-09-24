  /* ---------- Rendering (render orchestrates small builders) ---------- */
  function ensurePanel(e) {
    if (panel && panel.isConnected) return;
    panel = el("div", "__qPanel");
    window.__ccDom.own(panel);   /* a rebuild of ours is not a change the pass has to see */
    var anchor = e.closest('[class*="messageInputContainer_"]') || e.parentNode;
    anchor.parentNode.insertBefore(panel, anchor);
  }

  function buildResizeHandle() {
    var rh = el("div", "__qResize");
    rh.title = "Drag to resize";
    rh.addEventListener("pointerdown", startResize);
    return rh;
  }

  function buildHeader() {
    var head = el("div", "__qHead" + (collapsed ? " __qHeadCollapsed" : ""));
    /* The pause now holds scheduled messages too, so the button has to say so:
       a hold that silently lets some items through is the surprise this whole
       group split exists to remove. */
    var toggle = btn("__qToggle" + (paused ? " __qPlay" : ""), paused
      ? "Resume - queued and scheduled messages start again"
      : "Pause everything, scheduled messages included");
    toggle.addEventListener("click", function () {
      paused = !paused;
      render();
      if (!paused && !isBusy() && Q.length) flush();
    });
    var label = el("span", "__qHeadLabel"), nf = floatItems().length;
    label.textContent = (paused ? "paused \u00B7 " : "") + (Q.length - nf) + " queued" +
      (nf ? " \u00B7 " + nf + " scheduled" : "");
    var min = btn("__qMin", collapsed ? "Expand queue" : "Minimize queue");
    min.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="' + (collapsed ? "6 15 12 9 18 15" : "6 9 12 15 18 9") + '"></polyline></svg>';
    min.addEventListener("click", function () { collapsed = !collapsed; render(); });
    head.appendChild(toggle);
    head.appendChild(label);
    head.appendChild(buildSavedHeadButton());   /* save this queue / open the saved ones */
    head.appendChild(min);
    return head;
  }

  function navBtn(cls, title, glyph, disabled, fn) {
    var b = btn(cls, title);
    b.textContent = glyph;
    b.disabled = disabled;
    b.addEventListener("click", function (e) { e.stopPropagation(); fn(); });
    return b;
  }

  /* All four controls move the item inside the LANE - a floating scheduled
     item has no position at all and is drawn without this column - so all
     four are one call to moveItemTo with a lane ordinal, and the queue is
     never spliced a second way. Always rendered and merely disabled at the
     ends, so every row is the same height: the to-top button used to be
     omitted on the first row, which made that one row shorter than the rest. */
  function buildNav(it, ord, n) {
    var nav = el("span", "__qNav"), first = (ord <= 1), last = (ord >= n);
    nav.appendChild(navBtn("__qTop", "Move to top", "\u2912", first, function () { moveItemTo(it, 1); }));
    nav.appendChild(navBtn("__qUp", "Move up", "\u25B2", first, function () { moveItemTo(it, ord - 1); }));
    nav.appendChild(navBtn("__qDown", "Move down", "\u25BC", last, function () { moveItemTo(it, ord + 1); }));
    nav.appendChild(navBtn("__qBottom", "Move to bottom", "\u2913", last, function () { moveItemTo(it, n); }));
    return nav;
  }

  /* A group heading, in the panel header's own type: the list is two lists
     and the reader has to be told which one they are looking at. */
  function buildGroup(label, hint) {
    var g = el("div", "__qGroup");
    var t = el("span", "__qGroupLabel");
    t.textContent = label;
    g.appendChild(t);
    if (hint) {
      var h = el("span", "__qGroupHint");
      h.textContent = hint;
      g.appendChild(h);
    }
    return g;
  }

  function buildThumbs(files) {
    var tb = el("span", "__qThumbs");
    files.forEach(function (fl) {
      var isImg = fl.dataUrl && fl.dataUrl.indexOf("data:image") === 0;
      if (isImg) {
        var im = el("img", "__qThumb");
        im.src = fl.dataUrl;
        im.title = "Click to preview";
        im.style.cursor = "zoom-in";
        im.addEventListener("click", function (ev) { ev.stopPropagation(); openPreview(fl.dataUrl, fl.name); });
        tb.appendChild(im);
      } else {
        var dc = el("span", "__qDoc");
        dc.title = fl.name;
        dc.textContent = ((fl.name.split(".").pop() || "") + "").toUpperCase().slice(0, 4) || "FILE";
        tb.appendChild(dc);
      }
    });
    return tb;
  }

