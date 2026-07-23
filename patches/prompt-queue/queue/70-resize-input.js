  /* ---------- Panel resize ---------- */
  function startResize(ev) {
    ev.preventDefault();
    var body = panel && panel.querySelector(".__qBody");
    if (!body) return;
    var startY = ev.clientY, startH = body.getBoundingClientRect().height;
    function move(e) {
      var dy = startY - e.clientY;
      bodyMax = Math.max(48, Math.min(window.innerHeight * 0.8, startH + dy));
      body.style.maxHeight = bodyMax + "px";
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /* ---------- Composer interception (enqueue while busy) ---------- */
  function commitComposerToQueue(ev, e) {
    var t = (e.textContent || "").trim();
    if (!t) return;
    var files = readChips();
    ev.preventDefault();
    ev.stopImmediatePropagation();
    enqueue(t, files);
    setText(e, "");
    if (files.length) clearChips();
    render();
  }

  function onComposerKeydown(ev) {
    try {
      if (flushing) return;
      var e = inp();
      if (!e || ev.target !== e) return;
      if (ev.key !== "Enter" || ev.shiftKey || ev.isComposing) return;
      if (useCtrlEnter() && !(ev.ctrlKey || ev.metaKey)) return;
      if (suggestionsOpen()) return;
      if (!isBusy()) return;
      if (hasUnmanagedChips()) return;
      commitComposerToQueue(ev, e);
    } catch (err) {}
  }

  function onComposerSubmit(ev) {
    try {
      if (flushing) return;
      var e = inp();
      if (!e) return;
      var f = e.closest("form");
      if (!f || ev.target !== f) return;
      if (!isBusy()) return;
      if (hasUnmanagedChips()) return;
      commitComposerToQueue(ev, e);
    } catch (err) {}
  }

