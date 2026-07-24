  /* ---------- Flushing (send one item when idle) ---------- */
  async function sendViaSession(s, it, files) {
    await s.send(it.text, files, false);
  }

  async function sendViaDom(e, it, files) {
    e.focus();
    setText(e, it.text);
    if (files.length) await reattachToComposer(files);
    var f = e.closest("form");
    if (f && f.requestSubmit) f.requestSubmit();
    else e.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", ctrlKey: true, bubbles: true, cancelable: true }));
  }

  async function flush() {
    /* 'paused' is enforced inside firstSendableIndex (it still lets a *due*
       scheduled item through), so it is intentionally not gated here. */
    if (flushing || editing || isBusy()) return;
    var idx = firstSendableIndex();
    if (idx < 0) return;
    var e = inp();
    if (!e) return;
    var s = getSession();
    var canSend = !!(s && typeof s.send === "function");
    var hasDraft = (e.textContent || "").trim().length > 0;
    /* Root protection: a DOM flush types the item into the box. With no session AND
       an unsent draft present, never type over it - wait until it is sent/cleared. */
    if (!canSend && hasDraft) return;
    flushing = true;
    var it = Q.splice(idx, 1)[0];
    render();
    if (!it.text || !it.text.trim()) { flushing = false; return; }  /* drop blank item, never send empty */
    try {
      var files = await buildFiles(it.files);
      if (canSend) await sendViaSession(s, it, files);
      else await sendViaDom(e, it, files);
    } catch (err) {
      Q.splice(idx, 0, it);
      render();
    } finally {
      flushing = false;
    }
  }

  /* Send one specific item RIGHT NOW - jump the queue order, ignore its
     schedule and the paused hold; the rest of the queue is left untouched.
     Still can't send while Claude is mid-turn (isBusy) - it no-ops then. */
  async function sendNow(it) {
    if (flushing || editing || isBusy()) return;
    var idx = Q.indexOf(it);
    if (idx < 0) return;
    var e = inp();
    if (!e) return;
    var s = getSession();
    var canSend = !!(s && typeof s.send === "function");
    if (!canSend && (e.textContent || "").trim().length > 0) return;   /* root protection (see flush) */
    flushing = true;
    Q.splice(idx, 1);
    render();
    if (!it.text || !it.text.trim()) { flushing = false; return; }
    try {
      var files = await buildFiles(it.files);
      if (canSend) await sendViaSession(s, it, files);
      else await sendViaDom(e, it, files);
    } catch (err) {
      Q.splice(Math.min(idx, Q.length), 0, it);
      render();
    } finally {
      flushing = false;
    }
  }

  /* ---------- Init ---------- */
  hookFileReader();
  document.addEventListener("keydown", onComposerKeydown, true);
  /* Ctrl+Alt+L opens the log viewer on demand (the button itself is hidden). */
  document.addEventListener("keydown", function (ev) {
    if (ev.ctrlKey && ev.altKey && (ev.key === "l" || ev.key === "L")) { ev.preventDefault(); ev.stopPropagation(); openLogModal(); }
  }, true);
  try {
    window.__ccLogs = function () { return _ccLogs.slice(); };            /* read logs programmatically */
    window.__ccLogBtn = function () { window.__ccLogBtnOn = 1; return "queue log button enabled"; };
  } catch (e) {}
  ensureAddButton();
  setInterval(function () {
    try {
      syncSession();
      ensureAddButton();
      if (Q.length && (!panel || !panel.isConnected)) render();
      armAfterItems();
      tickRings();
      if (!isBusy() && Q.length) flush();
    } catch (e) {}
  }, 150);
})();</script>
