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

  /* ---------- The surface auto-followup consumes ----------
     That patch keeps its own single slot beside this queue rather than pushing
     into it, for reasons its README sets out - chiefly that commitComposerToQueue
     deliberately pauses on an idle add, which is exactly when a follow-up is
     generated. But it must not re-implement sending: the session/DOM split, the
     root protection and the busy check below took real bugs to get right.

     So this is the whole contract, read-only except for send():
       count()   items the queue will send on its own. Non-zero means the user
                 is driving. A parked item is not driving and never leaves.
       paused()  the user's hold. Nothing auto may send through it.
       busy()    a turn is running.
       panel()   the queue panel node, or null - the lane renders inside it.
       send(t)   send one text now, by the same path a queued item takes.
       log(...)  append to the shared log ring, readable with Ctrl+Alt+L.
       sid()     the conversation id, resolved and cached by persist.js.
     Guarded so the first definition wins, like every other shared global here.

     send() cannot go through sendNow: that one takes an item already in Q and
     no-ops on anything else. sendText is the same two paths and the same guards,
     on a text that was never queued. */
  async function sendText(text) {
    var t = String(text || "").trim();
    if (!t || flushing || editing || isBusy()) return false;
    var e = inp();
    if (!e) return false;
    var s = getSession();
    var canSend = !!(s && typeof s.send === "function");
    if (!canSend && (e.textContent || "").trim().length > 0) return false;  /* root protection */
    flushing = true;
    try {
      if (canSend) await sendViaSession(s, { text: t }, []);
      else await sendViaDom(e, { text: t }, []);
      return true;
    } catch (err) {
      return false;
    } finally {
      flushing = false;
    }
  }

  window.__qAuto = window.__qAuto || {
    count: function () { return Q.filter(function (it) { return !isParked(it); }).length; },
    paused: function () { return paused; },
    busy: function () { return isBusy(); },
    panel: function () { return panel && panel.isConnected ? panel : null; },
    send: sendText,
    log: function (a, b, c) { try { ccLog("autofollowup", a, b, c); } catch (e) {} },
    sid: function () { return _curSid || ""; },

    /* Put a line in the queue as an ordinary item. Not through the composer:
       commitComposerToQueue pauses the queue on an idle add, which is exactly
       when a responder writes, so going that way would hold the queue every
       time. This is the same push the composer ends in, without that.

       off:true parks it as skipped - present, editable, one click from being
       sent - which is what a responder set to ask before sending needs. */
    add: function (text, opts) {
      if (!text || !String(text).trim()) return false;
      opts = opts || {};
      enqueue(String(text), [], true);
      if (opts.off) Q[Q.length - 1].off = true;
      render();
      return true;
    }
  };

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
      hookStopPause();
      ensureAddButton();
      if (Q.length && (!panel || !panel.isConnected)) render();
      armAfterItems();
      tickRings();
      if (!isBusy() && Q.length) flush();
    } catch (e) {}
  }, 150);
})();</script>
