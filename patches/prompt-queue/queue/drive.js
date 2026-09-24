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
       - a scheduled item coming due: one one-shot timer, for the earliest one;
       - a failed send's retry, after a back-off (see sendFailed).
     A countdown on screen is the only thing that needs a clock, and it gets
     the shared one (lib/js/ccClock.js) for exactly as long as it is showing. */
  var passQueued = false, dueTimer = 0, dueAt = 0, stopRings = null;
  var queueListeners = [];

  function pass() {
    passQueued = false;
    syncSession();
    hookStopPause();
    ensureAddButton();
    if (Q.length && (!panel || !panel.isConnected)) paint();
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
     a delete that moves the earliest item re-targets it too.

     Never more than a minute ahead, for two reasons. setTimeout keeps its
     delay in a signed 32-bit number, so a date past ~24.8 days fired at once,
     re-armed and fired again, forever. And the delay runs on a monotonic clock
     that may stop while the machine sleeps, where 'at' is wall-clock time: a
     send due at 09:00 through a sleep from 08:00 to 10:00 went out an hour
     late. Nothing in a webview reports a resume, so re-reading the wall clock
     once a minute is the fallback - only while something is scheduled. A
     visible countdown also pushes the moment it reaches zero (tickRings).

     The timer runs the pass itself rather than scheduling one: in a throttled
     window every timer hop can cost a second (measured in the lab: a 2 s
     timeout fired 1 s late), and a second hop doubled the lateness. */
  var DUE_MAX_MS = 60000;

  function armDueTimer() {
    var now = Date.now(), next = 0;
    for (var k = 0; k < Q.length; k++) {
      var at = Q[k].at;
      if (at && at > now && (!next || at < next)) next = at;
    }
    if (next === dueAt) return;
    if (dueTimer) { clearTimeout(dueTimer); dueTimer = 0; }
    dueAt = next;
    if (next) dueTimer = setTimeout(function () { dueTimer = 0; dueAt = 0; pass(); }, Math.min(next - now + 10, DUE_MAX_MS));
  }

  /* A send that threw - the app refused it before it began, e.g. an @mention
     it could not expand - leaves the item where it was. The pass must not try
     it again at once: render() asks for a pass, the retry fails and asks
     again, in a loop. It is retried after a pause that doubles from 1 s to
     30 s, and any send that works resets the pause. */
  var retryMs = 0, retryAt = 0;

  function sendFailed() {
    retryMs = Math.min(retryMs ? retryMs * 2 : 1000, 30000);
    retryAt = Date.now() + retryMs;
    setTimeout(pass, retryMs + 10);
  }

  function sendWorked() { retryMs = 0; retryAt = 0; }

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
