  /* ---------- Where a thing goes: overlays, and popups beside an anchor ----------

  /* The overlay has to be told how tall the screen is.

     The zoom patch sets zoom on <body>, and in Chromium a zoomed ancestor
     becomes the containing block for a fixed-position descendant - so inset:0
     stopped meaning the viewport and started meaning the body box, which is
     shorter. And vh inside a zoomed subtree is a viewport unit measured in the
     unzoomed space, so a 90vh cap rendered at 90vh times the zoom.

     Measured in a live panel at zoom 1.3: viewport 759px, overlay 584px, dialog
     729px, top at -51px - clipped off the top of the screen and off the bottom,
     with the header and the buttons both out of reach.

     The zoom is read, not inferred. It used to be inferred, from the quotient of
     a rect and an offsetHeight, and that quotient is not the same number in every
     engine: Chrome 141 returns a rect already multiplied by the zoom and the
     quotient is the zoom, but the Electron in VS Code 1.135 returns both in the
     element's own units, so the quotient is 1 at every zoom. Measured there at
     zoom 1.5: body rect 512, offsetHeight 512, so scale came out 1, the overlay
     was set to 768px, and 768 CSS px under zoom 1.5 paints 1152 of a 783px
     screen. The dialog hung a third of its height off the bottom of the panel.
     getComputedStyle().zoom is 1.5 in both engines, so that is what is used, and
     the quotient is only a fallback for an engine that will not report it.

     documentElement is not the zoomed element, so its clientHeight is in screen
     pixels in both engines; dividing it by the zoom gives the overlay its size in
     the units it is laid out in. The dialog is capped at 100% of the overlay, so
     it cannot leave the screen whatever the zoom is. */
  function zoomAbove(node) {
    var z = 1;
    for (var n = node; n && n.nodeType === 1; n = n.parentElement) {
      var v = parseFloat(window.getComputedStyle(n).zoom);
      if (isFinite(v) && v > 0) z *= v;
    }
    return z;
  }

  function fitOverlay(node) {
    var ov = node || dlg;
    if (!ov) return;
    var ref = ov.parentNode && ov.parentNode.nodeType === 1 ? ov.parentNode : document.body;
    var scale = zoomAbove(ref);
    if (!isFinite(scale) || scale <= 0) scale = 1;
    if (scale === 1) {
      var seen = document.body.getBoundingClientRect().height;
      var own = document.body.offsetHeight;
      if (own > 0 && seen > 0) {
        var ratio = seen / own;
        if (isFinite(ratio) && ratio > 0) scale = ratio;
      }
    }
    var screenH = document.documentElement.clientHeight || window.innerHeight || 0;
    var screenW = document.documentElement.clientWidth || window.innerWidth || 0;
    if (!screenH) return;
    ov.style.height = (screenH / scale) + "px";
    ov.style.width = (screenW / scale) + "px";
  }

  /* Named, for the reason the live view has its own: fitOverlay takes the
     overlay to size, so registering it directly handed it the resize Event as
     that argument and it set style.height on the event. The listener has been
     there since the fit was written and has never once run - drag the panel
     narrower with the dialog open and the dialog stayed at its old width and
     hung over the edge. Measured: panel 619 to 302, overlay still 341.9px. */
  function fitDlgNow() { fitOverlay(dlg); }

  /* Where a popup goes.

     Two callers, two frames of reference. The responder menu hangs off a
     toolbar button and belongs to the panel, so the panel is what bounds it and
     centring on the button is right. A field's list belongs to the dialog it
     was opened in - bounded by the panel instead, it ran out over the dialog's
     own header and past both its edges, which reads as a menu that lost its
     dialog. Measured at a 342px panel: the list spanned 10 to 322 inside a
     dialog spanning 21 to 321.

     So bounds is the frame the popup belongs to, and a list aligns to the start
     of its field rather than centring on it, which is where a select opens
     everywhere else. */
  function rectOf(node) {
    if (!node) return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    var r = node.getBoundingClientRect();
    return { left: r.left, top: r.top,
             right: r.right === undefined ? r.left + (r.width || 0) : r.right,
             bottom: r.bottom === undefined ? r.top + (r.height || 0) : r.bottom };
  }

  function place(m, anchor, o) {
    o = o || {};
    var pad = 8;
    var b = rectOf(o.bounds);
    var r = anchor.getBoundingClientRect();
    /* Cap first, measure after: a list longer than its frame scrolls inside it
       rather than deciding there is nowhere it fits. */
    var room = b.bottom - b.top - pad * 2;
    if (room > 0 && m.offsetHeight > room) m.style.maxHeight = room + "px";
    var w = m.offsetWidth, h = m.offsetHeight;
    var below = r.bottom + 6, above = r.top - h - 6;
    var top = o.below ? (below + h <= b.bottom - pad ? below : above)
                      : (above >= b.top + pad ? above : below);
    var left = o.start ? r.left : r.left + r.width / 2 - w / 2;
    m.style.top = Math.max(b.top + pad, Math.min(top, b.bottom - pad - h)) + "px";
    m.style.left = Math.max(b.left + pad, Math.min(left, b.right - pad - w)) + "px";
  }
