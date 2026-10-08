
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

  function pass() {
    pending = false;
    var rows = all ? Array.from(document.querySelectorAll(ROW)) : Array.from(dirty);
    all = false;
    dirty.clear();
    var idx = null;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row.isConnected || !isTool(row)) continue;
      idx = idx || indexStore();
      ensureBadge(row, idx);
      ensureMore(row);
    }
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
