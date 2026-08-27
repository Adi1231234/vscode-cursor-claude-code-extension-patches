  /* ---------- Manage responders: the shell ----------
     Two panes, the same shape background-tasks uses for its log dialog: the list
     on one side, the selected one's fields and prompt beside it. Editing happens
     here rather than in an editor tab because the files sit in ~/.claude, outside
     whatever project is open - a tab from another folder in the tab bar is a cost
     paid on every small edit, and most edits are one line.

     Save writes the file through the host, so git, history and any other editor
     see an ordinary markdown file. */
  var dlg = null, draft = null, dirty = false;

  function closeDialog() {
    /* The dropdown is appended to the body, not to the dialog, so removing the
       dialog leaves it behind - a menu floating over the panel with nothing
       under it and no way to dismiss it but clicking somewhere. */
    closeDrop();
    if (dlg && dlg.parentNode) dlg.parentNode.removeChild(dlg);
    dlg = null; draft = null; dirty = false;
    document.removeEventListener("keydown", onDialogKey, true);
    window.removeEventListener("resize", fitOverlay);
  }

  /* Escape takes the innermost layer, which is the one the person is looking at.
     It used to take the dialog from under an open dropdown and discard the edits
     with it, which is a lot to lose for a keypress that meant "close this menu". */
  function onDialogKey(ev) {
    if (ev.key !== "Escape") return;
    /* The live view sits on top of this one, and its own handler is registered
       later, so leaving the event alone is what lets the topmost layer take it.
       Escape used to close the dialog underneath while the view stayed up. */
    if (liveOpen()) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (dropOpen()) { closeDrop(); return; }
    closeDialog();
  }

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

  function fitOverlay() {
    if (!dlg) return;
    var ref = dlg.parentNode && dlg.parentNode.nodeType === 1 ? dlg.parentNode : document.body;
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
    dlg.style.height = (screenH / scale) + "px";
    dlg.style.width = (screenW / scale) + "px";
  }

  function openDialog() {
    requestList();
    if (dlg) closeDialog();
    dlg = el("div", "__afOverlay");
    on(dlg, "mousedown", function (ev) { if (ev.target === dlg) closeDialog(); });
    document.body.appendChild(dlg);
    fitOverlay();
    window.addEventListener("resize", fitOverlay);
    document.addEventListener("keydown", onDialogKey, true);
    selectDraft(armed || (list[0] && list[0].id) || null);
  }

  /* A responder that has never been saved is a draft with a new id; the list pane
     shows it in place so it is obvious what is being written. */
  function newDraft() {
    var n = 1, id = "responder";
    while (findResponder(id)) { n += 1; id = "responder-" + n; }
    return {
      id: id, name: id, description: "", context: "last-message+claims",
      max_turns: "20", autosend: "false", model: "opus", effort: "max",
      rules: "", stop: "", extra: {}, isNew: true
    };
  }

  function selectDraft(id) {
    var r = id ? findResponder(id) : null;
    draft = r ? JSON.parse(JSON.stringify(r)) : newDraft();
    dirty = false;
    renderDialog();
  }

  function listPane() {
    var pane = el("div", "__afPane __afList");
    list.forEach(function (r) {
      var it = el("div", "__afLItem" + (draft && draft.id === r.id ? " __afSel" : ""));
      var dot = el("span", "__afDot" + (armed === r.id ? "" : " __afDotOff"));
      var t = el("span", "__afT");
    t.dir = "auto";
      var nm = el("b"); txt(nm, r.name || r.id); t.appendChild(nm);
      if (r.description) { var d = el("span"); txt(d, r.description); t.appendChild(d); }
      it.appendChild(dot); it.appendChild(t);
      press(it, function () {
        if (dirty && !confirm("Discard the unsaved changes?")) return;
        selectDraft(r.id);
      });
      pane.appendChild(it);
    });
    if (draft && draft.isNew) {
      var mine = el("div", "__afLItem __afSel");
      var t2 = el("span", "__afT"); var b2 = el("b");
      txt(b2, draft.name || draft.id); t2.appendChild(b2);
      mine.appendChild(el("span", "__afDot __afDotOff")); mine.appendChild(t2);
      pane.appendChild(mine);
    }
    var add = el("div", "__afNew");
    txt(add, "+ New responder");
    press(add, function () {
      if (dirty && !confirm("Discard the unsaved changes?")) return;
      selectDraft(null);
    });
    pane.appendChild(add);
    return pane;
  }

  function renderDialog() {
    if (!dlg) return;
    dlg.innerHTML = "";
    var box = el("div", "__afDlg");
    var head = el("div", "__afDlgHead");
    var h = el("h3"); txt(h, "Responders"); head.appendChild(h);
    var x = el("span", "__afX"); txt(x, "✕");
    x.setAttribute("aria-label", "Close");
    press(x, closeDialog);
    head.appendChild(x);
    box.appendChild(head);

    var body = el("div", "__afDlgBody");
    body.appendChild(listPane());
    body.appendChild(editPane());
    box.appendChild(body);
    box.appendChild(footer());
    dlg.appendChild(box);
  }
