  /* ---------- After a usage limit: a continue, at the reset or on Play ----------
     When a run ends refused (usage-limit.js), the queue must not send into the
     limit, and the task the limit cut should be the first thing to carry on.
     So a "continue" goes at the front of the lane - one item, of one of two
     kinds (it.resume):

     - "reset": the session (five-hour) limit, with "Continue after the session
       limit" on in Settings (the default). Timed for a minute past the reset
       and holding everything behind it: the at-time gate schedule-order.js
       already runs, so the queue's own clock sends it, the cut task picks up
       where it stopped, and the rest follow one per turn.
     - "play": any other limit (weekly, a model's weekly, one the CLI did not
       name). A weekly reset can be days away, so nothing goes by itself: the
       queue parks, and when the person presses Play the continue goes first.

     Either way it happens with an empty queue too - a task typed by hand is
     cut just the same - and the continue is an ordinary row (moved, edited,
     rescheduled or deleted like any other) marked with where it came from.
     With the setting off, the session limit only parks the queue, as a Stop
     does, and adds nothing.

     All on the run's end, like a stop from elsewhere (stop-pause.js): the busy
     callback is a microtask and the pass that would flush is a timer, so the
     queue is held before it can send. The first value after a switch of
     conversation is no run's end. */
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

  /* One continue at most, of either kind: a second refusal re-uses it. Says
     whether anything of the person's own was waiting besides it. */
  function placeResume(kind) {
    var it = resumeItem();
    var theirs = Q.some(function (x) { return !x.resume && !isParked(x); });
    if (!it) {
      it = { id: ++idc, text: RESUME_TEXT, files: [] };
      var lane = laneItems();
      Q.splice(lane.length ? Q.indexOf(lane[0]) : Q.length, 0, it);
    }
    it.resume = kind;
    return { it: it, theirs: theirs };
  }

  /* If nothing of the person's was waiting, a pause has nothing to hold and
     is lifted, or the continue would sit behind it; a pause over their own
     items stays theirs. */
  function resumeAtReset() {
    var p = placeResume("reset");
    if (!p.theirs) paused = false;
    setSchedule(p.it, "time", limit.until + RESUME_AFTER_MS, 0, true);   /* renders */
    ccLog("queue", "the turn ended on the " + limitText() + " - continue at " + fmtClock(p.it.at), "n=" + Q.length);
  }

  function resumeOnPlay() {
    var p = placeResume("play");
    paused = true;
    setSchedule(p.it, "queue");   /* renders */
    ccLog("queue", "the turn ended on the " + limitText() + " - queue parked, continue first on play", "n=" + Q.length);
  }

  function parkOnLimit() {
    if (paused || !Q.length) return;
    paused = true;
    render();
    ccLog("queue", "the turn ended on the " + limitText() + " - queue parked (continue is off in Settings)", "n=" + Q.length);
  }

  /* Only a run whose own result was the 429 (usage-limit.js) was refused: a
     local command ending while the limit still holds was not, and must
     neither move the continue nor park anything. Any other run is asked
     whether it went through instead. */
  var resumeRunMark = null;
  function watchUsageLimit() {
    var S = window.__ccSession;
    if (watchUsageLimit.on || !S) return;
    watchUsageLimit.on = 1;
    S.on("busy", function (busy, store, initial) {
      if (busy || initial) {
        runRefused = false;
        resumeRunMark = busy && !initial && window.__ccReply ? window.__ccReply.mark(store) : null;
        return;
      }
      var refused = runRefused, mark = resumeRunMark;
      runRefused = false;
      resumeRunMark = null;
      if (!refused) tookOver(mark, store);
      else if (limitForRefusal(Date.now()).type !== "five_hour") resumeOnPlay();
      else if (resumeAllowed()) resumeAtReset();
      else parkOnLimit();
    });
  }

  /* A run of the person's own went through while the continue waited - a
     prompt they sent, or Send now: they took over, and "continue" would only
     repeat them, so it goes. "Went through" is a model answering in that run
     (lib/js/ccReply.js), never an "allowed" frame: a side call on another
     model can come back allowed while the main one is refused - measured, a
     cheap call let through a second after the refusal dropped the continue. */
  function tookOver(mark, store) {
    var it = resumeItem(), r = mark && window.__ccReply ? window.__ccReply.since(mark, store) : null;
    if (!it || isDue(it) || !r || !r.answered) return;
    Q.splice(Q.indexOf(it), 1);
    render();
    ccLog("queue", "a run went through before the continue was due - somebody took over, dropped it", "n=" + Q.length);
  }

  /* Asked by flush just before it sends: may this item go? While a "reset"
     continue waits and the limit still holds, nothing goes - the lane is
     already behind the continue, but a floating scheduled item is not, and
     would only be refused. From the reset on it may go (it is committed to its
     moment, not to the order; measured: it went at the reset, ahead of the
     continue's minute, and was answered). A continue the person parked holds
     nothing, and a "play" one waits behind the pause, which holds it all. */
  function holdForResume(it) {
    if (!it) return false;
    if (it.resume) return it.resume === "reset" && vetoResume(it);
    var r = resumeItem();
    return !!r && r.resume === "reset" && !isParked(r) && !isDue(r) && limitInForce(Date.now());
  }

  /* Turned off in Settings after it was scheduled: the continue goes, and the
     queue parks as it would have without the setting. */
  function vetoResume(it) {
    if (resumeAllowed()) return false;
    Q.splice(Q.indexOf(it), 1);
    if (Q.some(function (x) { return !isParked(x); })) paused = true;
    render();
    ccLog("queue", "continue after the session limit is off in Settings - dropped it", "n=" + Q.length);
    return true;
  }
