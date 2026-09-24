  /* ---------- Lane vs scheduled: which items hold the queue ----------
     The panel runs two groups, and the split comes from ONE property.

     An item GATES when the queue must not go past it: an 'after' item always
     (a countdown measured from "the one before me finished" only means
     anything in order), and a 'timer' / 'time' item whose 'hold' flag is set.
     A gating item is in the lane, carries a position number, and everything
     below it waits for it.

     An item FLOATS when it does not: a 'timer' / 'time' with no hold. It is
     committed to a wall-clock moment and to nothing else, so it has no
     position at all - it is drawn in its own group and the lane renumbers
     without it.

     Before this split a scheduled item did both at once: it kept its position
     number while letting the row below overtake it, so the list showed an
     order the queue never ran. That is the whole bug. 'timer' holds by
     default and 'time' does not, because "wait 10 minutes" is about pacing
     the queue while "tomorrow at 9" is about a moment in the world. */
  function isAbsolute(it) { return it.mode === "timer" || it.mode === "time"; }
  function gates(it) { return it.mode === "after" || (isAbsolute(it) && !!it.hold); }
  function floats(it) { return isAbsolute(it) && !it.hold; }
  function holdDefault(mode) { return mode === "timer"; }

  /* The lane, in queue order: everything that is not floating. Parked items
     stay in it - a skipped row keeps its place so that un-skipping puts it
     back where it was - they simply never send. */
  function laneItems() {
    return Q.filter(function (it) { return !floats(it); });
  }

  /* 1-based position within the lane, 0 for a floating item. Read live rather
     than passed around: a row's position field can outlive a queue shift (the
     item above it flushing) between focus and blur. */
  function laneOrdinal(it) { return laneItems().indexOf(it) + 1; }

  /* The scheduled group, soonest first: its only order is the clock. */
  function floatItems() {
    return Q.filter(function (it) { return floats(it); })
            .sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
  }

  /* The latest moment the lane is already held to before 'it' can send, or 0.
     Only absolute gates count: an 'after' item is armed by the queue, so its
     moment is not knowable while the schedule modal is open. Used to say, at
     the time of choosing, that an hour cannot be kept. */
  function gateAbove(it) {
    var stop = Q.indexOf(it), best = 0, k, g;
    if (stop < 0) stop = Q.length;
    for (k = 0; k < stop; k++) {
      g = Q[k];
      if (isParked(g) || !isAbsolute(g) || !gates(g) || !g.at) continue;
      if (g.at > best) best = g.at;
    }
    return best;
  }

  /* How many items would wait behind 'it' if it held the lane - the cost of
     switching the hold on, stated before it is switched on. */
  function heldBelow(it) {
    var from = Q.indexOf(it), n = 0, k;
    if (from < 0) return 0;
    for (k = from + 1; k < Q.length; k++) if (!isParked(Q[k]) && !floats(Q[k])) n++;
    return n;
  }
