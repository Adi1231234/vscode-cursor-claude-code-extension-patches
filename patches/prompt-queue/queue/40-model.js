  /* ---------- Queue model ---------- */
  function enqueue(text, files) {
    Q.push({ id: ++idc, text: text, files: files });
  }

  function removeAt(i) {
    Q.splice(i, 1);
    render();
  }

  function swapItems(i, j) {
    if (i < 0 || j < 0 || i >= Q.length || j >= Q.length) return;
    var t = Q[i];
    Q[i] = Q[j];
    Q[j] = t;
    render();
  }

  function moveToFirst(i) {
    if (i <= 0 || i >= Q.length) return;
    Q.unshift(Q.splice(i, 1)[0]);
    render();
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

  function firstSendableIndex() {
    for (var k = 0; k < Q.length; k++) {
      if (!Q[k].off) return k;
    }
    return -1;
  }

