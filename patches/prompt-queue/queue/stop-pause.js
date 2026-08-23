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

  /* Idempotent, and re-runs per tick because the session object is replaced
     when the active conversation changes. */
  function hookStopPause() {
    var s = getSession();
    if (!s || s.__qStopHook || typeof s.interrupt !== "function") return;
    var orig = s.interrupt;
    s.interrupt = function () {
      try { pauseOnStop(); } catch (e) {}
      return orig.apply(this, arguments);
    };
    s.__qStopHook = 1;
    ccLog("queue", "stop hook installed");
  }
