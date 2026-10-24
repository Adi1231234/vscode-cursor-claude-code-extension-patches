  /* ---------- Flushing (send one item when idle) ---------- */
  async function sendViaSession(s, it, files) {
    await s.send(it.text, files, false);
  }

  async function sendViaDom(e, it, files) {
    e.focus();
    setText(e, it.text);
    if (files.length) await reattachToComposer(files);
    await submitComposer(e);   /* env-*.js: throws when the surface can tell it was not sent */
  }

  async function flush() {
    /* 'paused' is enforced inside firstSendableIndex (it still lets a *due*
       scheduled item through), so it is intentionally not gated here. */
    if (flushing || editing || isBusy() || Date.now() < retryAt) return;
    var idx = firstSendableIndex();
    if (idx < 0 || holdForResume(Q[idx])) return;   /* limit-resume.js */
    /* A session that sends by itself needs no composer: the desktop app's
       queue for a conversation that is not on screen has none. */
    var e = inp();
    var s = getSession();
    var canSend = !!(s && typeof s.send === "function");
    if (!e && !canSend) return;
    var hasDraft = !!e && composerText(e).trim().length > 0;
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
      sendWorked();
    } catch (err) {
      Q.splice(idx, 0, it);
      sendFailed();
      render();
    } finally {
      flushing = false;
    }
  }

  /* Send one specific item RIGHT NOW - jump the queue order, ignore its
     schedule, the paused hold AND a running turn; the rest is left untouched.
     Mid-turn is the app's own case: session.send has no busy gate, it holds
     the message and hands it to the CLI, exactly what Enter does then. */
  async function sendNow(it) {
    var idx = Q.indexOf(it);
    if (idx < 0 || sendBlocked(it)) return;   /* row-menu.js: every reason, root protection included */
    var e = inp(), s = getSession();
    var canSend = !!(s && typeof s.send === "function");
    flushing = true;
    Q.splice(idx, 1);
    render();
    if (!it.text || !it.text.trim()) { flushing = false; return; }
    try {
      var files = await buildFiles(it.files);
      if (canSend) await sendViaSession(s, it, files);
      else await sendViaDom(e, it, files);
      sendWorked();
    } catch (err) {
      Q.splice(Math.min(idx, Q.length), 0, it);
      sendFailed();
      render();
    } finally {
      flushing = false;
    }
  }

  /* ---------- The surface other patches read ----------
     Read-only, so nothing outside reaches into the queue's own state:
       count()   items the queue will send on its own. A parked item never
                 leaves, so it is not counted.
       paused()  the user's hold. Nothing goes out through it.
       busy()    a turn is running, or this queue is sending one.
     panel-settings asks count() and paused() whether more work is lined up
     behind the run that just ended. Guarded so the first definition wins, like
     every other shared global here. */
  expose("__qAuto", {
    count: function () { return Q.filter(function (it) { return !isParked(it); }).length; },
    paused: function () { return paused; },
    busy: function () { return isBusy() || flushing; }
  });

