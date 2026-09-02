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
      missed: !!it.missed,
      rearm: !!it.rearm,
      auto: !!it.auto        /* a copy of a written line was still written */
    });
    render();
  }

  function swapItems(i, j) {
    if (swapAt(Q, i, j)) render();
  }

  /* Jump to either end. Both are a move to a clamped position, so they reuse
     moveItemTo rather than splicing the queue a second way. */
  function moveToEnd(i, last) {
    if (i < 0 || i >= Q.length) return;
    moveItemTo(Q[i], last ? Q.length : 1);
  }

  /* Reorder by typed position: MOVE (not swap) the item to 1-based slot p,
     clamped into [1, length]. Identity-based so it stays correct even if the
     queue shifted (e.g. the top item flushed) while the field was focused. */
  function moveItemTo(it, p) {
    var from = Q.indexOf(it);
    if (from >= 0) {                 /* skip move if already sent/removed */
      var to = p - 1;
      if (to < 0) to = 0;
      if (to > Q.length - 1) to = Q.length - 1;
      if (to !== from) {
        Q.splice(from, 1);
        Q.splice(to, 0, it);
      }
    }
    /* Always re-render so an edited number snaps back to the real position -
       e.g. an out-of-range value like 8 in a 3-item queue resets to 3. */
    render();
  }

  function toggleSkip(it) {
    it.off = !it.off;
    render();
  }

  /* Which item sends next:
     1) an absolute schedule (timer / at-time) that is DUE jumps ahead, even
        while paused - a commitment to a wall-clock moment.
     2) otherwise the ordered lane runs from the front (only when not paused):
        pending absolute schedules are transparent, an 'after' item GATES the
        queue (nothing behind it goes until it is armed and due), and the first
        plain item sends. missed / rearm items are inactive and skipped. */
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
    for (k = 0; k < Q.length; k++) {
      it = Q[k];
      if (isParked(it)) continue;
      if ((it.mode === "timer" || it.mode === "time") && isDue(it)) return k;
    }
    if (paused) return -1;
    for (k = 0; k < Q.length; k++) {
      it = Q[k];
      if (isParked(it)) continue;
      if (it.mode === "timer" || it.mode === "time") continue;
      if (it.mode === "after") return (it.at && isDue(it)) ? k : -1;
      return k;
    }
    return -1;
  }

