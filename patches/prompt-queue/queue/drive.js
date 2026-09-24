  /* ---------- What runs the queue ----------
     One pass: pick up a conversation switch, keep the stop hook and the footer
     buttons in place, bring the panel back if React dropped it, arm 'after'
     items, and send the next item when Claude is idle.

     It used to run every 150 ms, in every panel, whether anything had changed
     or not - and in a panel that could not resolve its session, each of those
     passes repeated a document-wide fiber walk that is never cached on a miss.
     Everything the pass reads can now only change on a push, so it runs on
     those and on nothing else:
       - busy, the session id and the conversation itself (lib/js/ccSession.js);
       - the app re-rendering the composer (lib/js/ccWatch.js, scoped to it -
         the panel and the buttons are ours, so our own re-render is not one);
       - the queue itself changing (render() schedules a pass);
       - a scheduled item coming due: one one-shot timer, for the earliest one.
     A countdown on screen is the only thing that needs a clock, and it gets
     the shared one (lib/js/ccClock.js) for exactly as long as it is showing. */
  var passQueued = false, dueTimer = 0, dueAt = 0, stopRings = null;
  var queueListeners = [];

  function pass() {
    passQueued = false;
    syncSession();
    hookStopPause();
    ensureAddButton();
    if (Q.length && (!panel || !panel.isConnected)) render();
    armAfterItems();
    keepRingClock();
    armDueTimer();
    if (!isBusy() && Q.length) flush();
    for (var i = 0; i < queueListeners.length; i++) {
      try { queueListeners[i](); } catch (e) {}
    }
  }

  /* A timer, not requestAnimationFrame: a hidden panel never gets a frame, and
     a queue has to keep sending while another view is in front. */
  function schedulePass() {
    if (passQueued) return;
    passQueued = true;
    setTimeout(pass, 0);
  }

  /* The earliest future 'at' in the queue, woken exactly then (+10 ms so the
     item reads as due when the pass looks). Re-armed by every pass, which is
     every time the queue or the busy state changes - so an edit, a reorder or
     a delete that moves the earliest item re-targets it too. */
  function armDueTimer() {
    var now = Date.now(), next = 0;
    for (var k = 0; k < Q.length; k++) {
      var at = Q[k].at;
      if (at && at > now && (!next || at < next)) next = at;
    }
    if (next === dueAt) return;
    if (dueTimer) { clearTimeout(dueTimer); dueTimer = 0; }
    dueAt = next;
    if (next) dueTimer = setTimeout(function () { dueTimer = 0; dueAt = 0; schedulePass(); }, next - now + 10);
  }

  function keepRingClock() {
    var showing = !!(panel && panel.isConnected && panel.querySelector(".__qRing,.__qWhen"));
    if (showing && !stopRings) stopRings = window.__ccClock.every(tickRings);
    else if (!showing && stopRings) { stopRings(); stopRings = null; }
  }

  /* The surface auto-followup waits on: told after every pass, so a queue that
     empties or un-pauses releases a follow-up without anyone polling count(). */
  function onQueueChange(fn) {
    if (typeof fn === "function") queueListeners.push(fn);
  }

  function composerArea() {
    var e = inp(), form = e && e.closest("form");
    return form ? form.parentElement : null;
  }

  function wireQueue() {
    var S = window.__ccSession;
    if (S) {
      S.on("busy", schedulePass);
      S.on("sessionId", schedulePass);
      S.onStore(schedulePass);
    }
    window.__ccWatch.on(schedulePass, { scope: composerArea });
    schedulePass();
  }
