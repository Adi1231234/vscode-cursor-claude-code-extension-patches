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
    if (paused || flushing || editing || isBusy()) return;
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

  /* ---------- Init ---------- */
  hookFileReader();
  document.addEventListener("keydown", onComposerKeydown, true);
  document.addEventListener("submit", onComposerSubmit, true);
  setInterval(function () {
    try {
      if (Q.length && (!panel || !panel.isConnected)) render();
      if (!isBusy() && Q.length) flush();
    } catch (e) {}
  }, 150);
})();</script>
