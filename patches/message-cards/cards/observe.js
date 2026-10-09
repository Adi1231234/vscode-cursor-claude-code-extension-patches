
  /* ---------- Which rows to look at, and when ---------- */

  /* Only the rows the app touched: a change inside one, or one arriving. The
     first pass takes them all; after that a row is looked at when it changes,
     which is also the only time its badge or its clamp can change. */
  var dirty = new Set(), all = true, pending = false;

  function collect(records) {
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      var row = t && t.closest(ROW);
      if (row) { dirty.add(row); continue; }
      var added = r.addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType !== 1) continue;
        if (n.matches(ROW)) dirty.add(n);
        else if (n.firstElementChild) n.querySelectorAll(ROW).forEach(function (x) { dirty.add(x); });
      }
    }
  }

  /* Every read first - the store, and the one layout the clamps need (the app
     has usually laid the frame out already, scrolling to the bottom) - then
     every write, so a pass costs the panel at most one more layout however
     many rows changed. */
  function pass() {
    pending = false;
    var rows = (all ? Array.from(document.querySelectorAll(ROW)) : Array.from(dirty))
      .filter(function (row) { return row.isConnected && isTool(row); });
    all = false;
    dirty.clear();
    if (!rows.length) return;
    var idx = indexStore();
    var seen = rows.map(function (row) {
      return { row: row, text: badgeText(row, idx), cuts: cuts(row) };
    });
    seen.forEach(function (s) {
      ensureBadge(s.row, s.text);
      ensureMore(s.row, s.cuts);
    });
  }

  /* One pass a frame. A hidden panel runs no frames and keeps its dirty set,
     so it catches up the moment it is shown. */
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(pass);
  }

  window.__ccWatch.on(function (records) {
    collect(records);
    if (dirty.size) schedule();
  });

  /* A narrower panel can cut a block that fitted: measure every card again. */
  window.addEventListener("resize", function () { all = true; schedule(); });
  schedule();
})()</script>
