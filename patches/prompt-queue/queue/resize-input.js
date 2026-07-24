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

  /* ---------- Composer: explicit queue only ----------
     Plain Enter and the app's send button are left completely untouched -
     they send immediately, exactly as normal. The ONLY thing that enqueues
     is the explicit gesture (Alt+Enter / the add button). hold=true parks
     the queue when idle so a deliberately-built batch doesn't auto-fire;
     the panel's play button releases it. Returns false (event untouched)
     when there is nothing safe to queue. */
  function commitComposerToQueue(ev, e, hold) {
    var t = (e.textContent || "").trim();
    if (!t || hasUnmanagedChips()) return false;
    var files = readChips();
    ev.preventDefault();
    ev.stopImmediatePropagation();
    enqueue(t, files);
    setText(e, "");
    if (files.length) clearChips();
    if (hold && !isBusy()) paused = true;
    render();
    return true;
  }

  function onComposerKeydown(ev) {
    try {
      if (flushing) return;
      var e = inp();
      if (!e || ev.target !== e) return;
      if (ev.key !== "Enter" || ev.shiftKey || ev.isComposing || !ev.altKey) return;
      if (suggestionsOpen()) return;
      commitComposerToQueue(ev, e, true);  /* Alt+Enter: add to queue (idle or busy) */
    } catch (err) {}
  }

