  /* The windows the line shows, in order, with the app's own wording
     ("Session (5hr)", "Weekly (7 day)") shortened to fit one line. */
  var SHOWN = [["five_hour", "Session"], ["seven_day", "Weekly"]];

  /* A window as the app keeps it: utilization 0..1, resetsAt in seconds.
     Past its reset it is fully left again - the app's own meter reads it the
     same way, and no event says so. */
  function percentLeft(w, nowMs) {
    if (w.resetsAt !== undefined && w.resetsAt * 1000 <= nowMs) return 100;
    var used = Math.round((w.utilization || 0) * 100);
    return Math.max(0, Math.min(100, 100 - used));
  }

  /* { text, nextAt }: the line, or null when the account has no windows (an
     API key, or before the first reading), and when it next changes on its
     own - the earliest reset still ahead, or 0 for none. */
  function usageView(windows, nowMs) {
    var parts = [], nextAt = 0;
    for (var i = 0; windows && i < SHOWN.length; i++) {
      var w = windows[SHOWN[i][0]];
      if (!w) continue;
      parts.push(SHOWN[i][1] + " " + percentLeft(w, nowMs) + "% left");
      var at = w.resetsAt === undefined ? 0 : w.resetsAt * 1000;
      if (at > nowMs && (!nextAt || at < nextAt)) nextAt = at;
    }
    return { text: parts.length ? parts.join(" · ") : null, nextAt: nextAt };
  }
