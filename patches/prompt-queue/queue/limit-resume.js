  /* ---------- After a usage limit: continue at the reset, or park ----------
     When a run ends while the account is refused (usage-limit.js), the queue
     must not send into it. Two answers:

     - The session (five-hour) limit, with "Continue after the session limit"
       on in Settings (the default): "continue" goes at the front of the lane,
       timed for a minute past the reset and holding everything behind it.
       That is the at-time gate schedule-order.js already runs, so the queue's
       own clock sends it - the stopped task picks up where it was cut - and
       the rest follow one per turn. It happens with an empty queue too: a
       task you typed yourself is stopped just the same. It is an ordinary
       row - moved, edited, rescheduled or deleted like any other - marked
       with where it came from.
     - Any other limit (weekly, a model's), or the setting off: the queue
       parks, exactly like a Stop. A weekly reset can be days away.

     Both on the run's end, like a stop from elsewhere (stop-pause.js): the
     busy callback is a microtask and the pass that would flush is a timer,
     so the queue is held before it can send. The first value after a switch
     of conversation is no run's end. */
  var RESUME_TEXT = "continue";
  var RESUME_AFTER_MS = 60000;   /* past the reset, so "continue" does not race it */

  /* Read when it is needed, from the settings dialog's store (panel-settings
     exports it). Without that patch there is no switch to turn it off, so it
     is on - the default the switch has too. */
  function resumeAllowed() {
    try {
      var s = window.__ccSettings;
      return s && typeof s.get === "function" ? s.get("resumeAfterLimit") !== false : true;
    } catch (e) {
      return true;
    }
  }

  function resumeItem() {
    for (var k = 0; k < Q.length; k++) if (Q[k].resume) return Q[k];
    return null;
  }

  /* One such item at most: a second refusal moves it. If nothing of the
     person's was waiting, a pause has nothing to hold and is lifted, or the
     continue would sit behind it; a pause over their own items stays theirs. */
  function scheduleResume() {
    var it = resumeItem();
    var theirs = Q.some(function (x) { return !x.resume && !isParked(x); });
    if (!it) {
      it = { id: ++idc, text: RESUME_TEXT, files: [], resume: true };
      var lane = laneItems();
      Q.splice(lane.length ? Q.indexOf(lane[0]) : Q.length, 0, it);
    }
    if (!theirs) paused = false;
    setSchedule(it, "time", limit.until + RESUME_AFTER_MS, 0, true);   /* renders */
    ccLog("queue", "the turn ended on the " + limitText() + " - continue at " + fmtClock(it.at), "n=" + Q.length);
  }

  function parkOnLimit() {
    if (paused || !Q.length) return;
    paused = true;
    render();
    ccLog("queue", "the turn ended on the " + limitText() + " - queue parked", "n=" + Q.length);
  }

  function watchUsageLimit() {
    var S = window.__ccSession;
    if (watchUsageLimit.on || !S) return;
    watchUsageLimit.on = 1;
    S.on("busy", function (busy, store, initial) {
      if (busy || initial || !limitInForce(Date.now())) return;
      if (limit.type === "five_hour" && resumeAllowed()) scheduleResume();
      else parkOnLimit();
    });
  }

  /* A frame lifted the refusal before the continue was due: a run went
     through (credits, or a prompt of the person's own), so somebody took
     over and "continue" would only repeat them. It goes. The caller renders. */
  function limitLifted() {
    var it = resumeItem();
    if (!it || isDue(it)) return;
    Q.splice(Q.indexOf(it), 1);
    ccLog("queue", "the limit lifted before the continue was due - dropped it", "n=" + Q.length);
  }

  /* Turned off in Settings after it was scheduled: the continue goes, and the
     queue parks as it would have without the setting. Asked by flush just
     before it sends. */
  function vetoResume(it) {
    if (!it || !it.resume || resumeAllowed()) return false;
    Q.splice(Q.indexOf(it), 1);
    if (Q.some(function (x) { return !isParked(x); })) paused = true;
    render();
    ccLog("queue", "continue after the session limit is off in Settings - dropped it", "n=" + Q.length);
    return true;
  }
