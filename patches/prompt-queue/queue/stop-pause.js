  /* ---------- Stop -> park the queue ----------
     Every way to stop a running turn - the composer's stop button, a plain
     Escape, and restartClaude - funnels into the session's own interrupt().
     That single funnel is where the queue is held: stopping Claude mid-turn
     means "not this, and not whatever came after it", so the next item must
     not be sent the moment the turn ends.
     Decorating the instance method (an own property shadowing the prototype)
     runs synchronously with the gesture - before busy flips false and the
     flush loop wakes up. Re-detecting the same gestures in the DOM instead
     would have to re-implement the app's own conditions and would still race
     the flush.
     Only a real stop counts: interrupt() also runs for a plain Escape while
     idle, which is not a stop, and an empty queue has nothing to hold. */
  function pauseOnStop() {
    if (paused || !Q.length || !isBusy()) return;
    paused = true;
    render();          /* header switches to 'paused' + the play button; render persists it */
    ccLog("queue", "stop pressed - queue parked", "n=" + Q.length);
  }

  /* Idempotent (marked on the object, like the FileReader hook), and re-run on
     every pass because the session object is replaced when the conversation
     changes. Wrapped in its own try/catch: this is an optional decoration on
     someone else's object, and a throw here would otherwise skip the rest of the
     pass - the add button and the flush - on this pass and every one after it. */
  function hookStopPause() {
    try {
      if (decorateSession("interrupt", "__qStopHook", pauseOnStop)) ccLog("queue", "stop hook installed");
    } catch (e) {
      ccLog("queue", "stop hook FAILED", e && e.message);
    }
  }

  /* A stop that never passes through this panel's interrupt(): Stop pressed in
     the Claude app over Remote Control, or in another client. It reaches the
     CLI directly, so the hook above never runs - measured 2026-10-04 in the
     lab with the connection's own interruptClaude(): the turn ended and the
     queue sent its next item at once, so stopping from the phone did not stop.
     What every stop does leave is a "[Request interrupted by user]" row in the
     store (lib/js/ccReply.js), there before busy falls. So the run's start is
     marked, and on its end a stop found since then parks the queue the same
     way. The busy callback is a microtask and the pass that would flush is a
     timer, so the queue is parked before it can send.
     A tool refused in the panel with no reason given leaves the same row: the
     app sends the refusal with interrupt set, and the turn ends there. That is
     the person stopping Claude too, so it parks the queue as well; a refusal
     with a reason does not end the turn and leaves no such row.
     The first value after a switch of conversation (initial) is the new
     store's state, not an edge of a run here: a mark taken in the old
     conversation must not be read against the new one. */
  var runMark = null;
  function watchStopsElsewhere() {
    var S = window.__ccSession;
    if (watchStopsElsewhere.on || !S || !window.__ccReply) return;
    watchStopsElsewhere.on = 1;
    S.on("busy", function (busy, store, initial) {
      if (initial) { runMark = null; return; }
      if (busy) { runMark = window.__ccReply.mark(store); return; }
      var r = runMark === null ? null : window.__ccReply.since(runMark, store);
      runMark = null;
      if (!r || !r.stopped || paused || !Q.length) return;
      paused = true;
      render();
      ccLog("queue", "the turn ended in a stop this panel's Stop did not see (the phone's Stop, or a tool refused with no reason) - queue parked", "n=" + Q.length);
    });
  }

  /* Play pressed while the run that was stopped is still winding down: what
     was stopped before it is settled, so only a stop after it may park again. */
  function restartRunMark() {
    if (runMark !== null && window.__ccReply) runMark = window.__ccReply.mark(getSession());
  }
