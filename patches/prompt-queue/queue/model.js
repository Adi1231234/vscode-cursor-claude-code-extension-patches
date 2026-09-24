  /* ---------- Queue model ---------- */
  /* "auto" marks an item a responder wrote rather than the user. It changes
     nothing about how the item behaves - same position, same menu, same
     everything - and only puts a mark on the row, because where a line came
     from is worth knowing and is not worth a second kind of item. */
  function enqueue(text, files, auto) {
    Q.push({ id: ++idc, text: text, files: files, auto: !!auto });
  }

  /* Identity-based, not index-based: the row menu can outlive a queue shift
     (an item above it flushing) between opening the menu and clicking Delete. */
  function removeItem(it) {
    var i = Q.indexOf(it);
    if (i < 0) return;
    Q.splice(i, 1);
    render();
  }

  /* Copy an item WITH everything around it - schedule (mode/at/start/dur and
     its restart flags), skipped state and attachments - right below the
     original. A 'time' copy keeps the same wall-clock moment; a 'timer' copy
     keeps the same remaining countdown, so it reads identically to its source. */
  function duplicateItem(it) {
    var i = Q.indexOf(it);
    if (i < 0) return;
    Q.splice(i + 1, 0, {
      id: ++idc,
      text: it.text,
      files: (it.files || []).map(function (f) { return { name: f.name, dataUrl: f.dataUrl, file: f.file }; }),
      off: !!it.off,
      mode: it.mode || "queue",
      at: it.at || null,
      start: it.start || null,
      dur: it.dur || null,
      hold: !!it.hold,       /* a copy holds the queue exactly as its source does */
      missed: !!it.missed,
      rearm: !!it.rearm,
      auto: !!it.auto        /* a copy of a written line was still written */
    });
    render();
  }

  /* Reorder by typed position: MOVE (not swap) the item to 1-based LANE slot
     p, clamped into [1, lane length]. The number in the panel counts lane
     items only, so a floating scheduled item sitting between two rows must not
     eat a slot - the target is resolved against the lane and translated back
     to a queue index. Identity-based so it stays correct even if the queue
     shifted (e.g. the top item flushed) while the field was focused. */
  function moveItemTo(it, p) {
    var from = Q.indexOf(it);
    if (from >= 0) {                 /* skip move if already sent/removed */
      Q.splice(from, 1);
      var lane = laneItems(), to = p - 1;
      if (to < 0) to = 0;
      if (to > lane.length) to = lane.length;
      Q.splice(to < lane.length ? Q.indexOf(lane[to]) : Q.length, 0, it);
    }
    /* Always re-render so an edited number snaps back to the real position -
       e.g. an out-of-range value like 8 in a 3-item queue resets to 3. */
    render();
  }

  function toggleSkip(it) {
    it.off = !it.off;
    render();
  }

  /* Which item sends next. Two scans, in the order the panel draws them:

     1) the SCHEDULED group (floating items, see schedule-order.js): out of the
        lane entirely, so a due one fires from wherever it sits and a pending
        one blocks nothing. It carries no position number, which is what earns
        it the right to ignore the order.
     2) the LANE, strictly from the front: the first gating item holds
        everything behind it until it is armed and due, and the first plain
        item sends. The numbers in the panel ARE this scan.

     'paused' stops both. A pause is the user's hold on the whole panel, and a
     scheduled item firing through it meant Stop - which pauses - did not stop.
     The cost is that nothing sends while the user is away, the same trade the
     restart policy already makes.

     missed / rearm / skipped items are parked: inactive, and never a gate -
     a skipped gate would be a deadlock nobody could see. */
  /* Parked: present in the list, and not something the queue will ever send
     on its own. off is set aside by hand or by a responder asking first,
     missed is a moment that passed while the window was closed, rearm is a
     countdown that lost its origin. Named once because three places have to
     agree: what flushes, what counts as the user driving, and what a restore
     holds the queue for. They did not agree, and a single parked item stopped
     the follow-up loop for good - it can never be sent, so the count it made
     non-zero could never fall. */
  function isParked(it) { return !!(it.off || it.missed || it.rearm); }

  function firstSendableIndex() {
    var k, it;
    if (paused) return -1;
    for (k = 0; k < Q.length; k++) {
      it = Q[k];
      if (!isParked(it) && floats(it) && isDue(it)) return k;
    }
    for (k = 0; k < Q.length; k++) {
      it = Q[k];
      if (isParked(it) || floats(it)) continue;
      if (gates(it)) return isDue(it) ? k : -1;
      return k;
    }
    return -1;
  }

