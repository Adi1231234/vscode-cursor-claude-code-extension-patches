  /* ---------- Fitting an overlay to the panel ----------

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
