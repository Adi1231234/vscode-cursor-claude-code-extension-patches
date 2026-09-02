  /* ---------- Shared modal chrome (overlay, head, foot, Esc, focus) ----------
     Three dialogs live in this panel now - the schedule modal, the log viewer
     and the saved-queues manager - and each one needs the same overlay, the
     same head with its close cross, the same foot, Esc and backdrop to
     dismiss, focus handed back where it came from, and Tab kept inside the
     box. That is written once here.

     A caller builds only its own content, appends it to sh.box, and calls
     sh.mount(), which closes the foot behind it and arms the listeners.
     Exactly one modal is open at a time (_shellClose), so opening a second
     dismisses the first instead of stacking two overlays and two focus traps
     on top of each other. */
  var _shellClose = null;

  function openShell(o) {
    if (_shellClose) _shellClose();
    var prevFocus = document.activeElement;
    var ov = el("div", "__qModalOv");
    var box = el("div", "__qModal" + (o.cls ? " " + o.cls : ""));
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", o.label || o.title || "Dialog");
    var head = el("div", "__qModalHead");
    var title = el("span");
    title.textContent = o.title || "";
    var x = btn("__qClose", "Close (Esc)");
    x.textContent = "✕";
    head.appendChild(title);
    head.appendChild(x);
    var foot = el("div", "__qModalFoot");

    function close() {
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      document.removeEventListener("keydown", onKey, true);
      if (_shellClose === close) _shellClose = null;
      try { prevFocus.focus(); } catch (e) {}
    }

    /* Capture phase: the app has body-level key handlers of its own, and Esc
       has to reach the dialog before them. The caller's onKey runs FIRST and
       can claim a key by returning true - which is how a dialog with a level
       inside it (a revealed field, a second view) makes Escape step back one
       level instead of always closing the whole thing. */
    function onKey(ev) {
      if (o.onKey && o.onKey(ev, close) === true) return;
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); return close(); }
      if (ev.key === "Tab") {
        var f = focusables(box);
        if (!f.length) return;
        var i = f.indexOf(ev.target), last = f.length - 1;
        if (ev.shiftKey && i <= 0) { ev.preventDefault(); f[last].focus(); }
        else if (!ev.shiftKey && i === last) { ev.preventDefault(); f[0].focus(); }
      }
    }

    function mount() {
      box.appendChild(foot);
      ov.appendChild(box);
      document.body.appendChild(ov);
      document.addEventListener("keydown", onKey, true);
      _shellClose = close;
    }

    x.addEventListener("click", close);
    ov.addEventListener("click", function (ev) { if (ev.target === ov) close(); });
    box.appendChild(head);
    return { ov: ov, box: box, head: head, title: title, foot: foot, close: close, mount: mount };
  }

