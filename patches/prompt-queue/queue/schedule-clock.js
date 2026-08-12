  /* ---------- Per-row clock cell (icon + countdown ring + state label) ---------- */
  var IC_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"></circle><polyline points="12 7.5 12 12 15 13.8"></polyline></svg>';
  var IC_TIMER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9.5" y1="2.7" x2="14.5" y2="2.7"></line><line x1="12" y1="2.7" x2="12" y2="5.5"></line><circle cx="12" cy="13.5" r="7.5"></circle><line x1="12" y1="13.5" x2="15" y2="11"></line></svg>';
  var IC_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="16" rx="2.5"></rect><line x1="3.5" y1="9" x2="20.5" y2="9"></line><line x1="8" y1="2.5" x2="8" y2="6"></line><line x1="16" y1="2.5" x2="16" y2="6"></line></svg>';
  var IC_REPLAY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 12a8.8 8.8 0 1 0 2.7-6.35"></path><polyline points="3 4 3 9 8 9"></polyline></svg>';
  var IC_MISS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"></circle><line x1="12" y1="7.5" x2="12" y2="12.5"></line><line x1="12" y1="15.7" x2="12" y2="15.9"></line></svg>';
  var IC_AFTER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 5 8 13 16 13"></polyline><polyline points="12.5 9.5 16 13 12.5 16.5"></polyline></svg>';

  function afterMins(it) { return labelMins(Math.round((it.dur || 0) / 60000)); }

  function clockIcon(it) {
    if (it.missed) return IC_MISS;
    if (it.rearm) return IC_REPLAY;
    if (it.mode === "after") return IC_AFTER;
    if (it.mode === "timer") return IC_TIMER;
    if (it.mode === "time") return IC_CAL;
    return IC_CLOCK;
  }

  /* Hover tooltip explains the state + the initial trigger time. */
  function clockTitle(it) {
    if (it.missed) return "Missed - was due " + fmtStamp(it.at) + " while the editor was closed. Click to reschedule.";
    if (it.rearm) return "Timer stopped on restart. Click to run " + labelMins(Math.round((it.dur || 0) / 60000)) + " again.";
    if (it.mode === "after") return it.at
      ? "Running a " + afterMins(it) + " timer, started when the previous message finished."
      : "Waits for the message before it to finish, then runs a " + afterMins(it) + " timer. Click to change.";
    if (isScheduled(it)) return "Scheduled " + fmtStamp(it.start) + "  →  sends " + fmtStamp(it.at);
    return "Schedule when to send";
  }

  function buildClock(it) {
    var waiting = it.mode === "after" && !it.at;   /* not yet its turn */
    var active = !!it.at && !it.missed && !it.rearm;
    var cls = it.missed ? " __qMissed" : it.rearm ? " __qRearm" : waiting ? " __qWaiting" : active ? " __qClockSet" : "";
    var wrap = el("span", "__qClock" + cls);
    /* dial = icon + ring only, so the countdown ring is a clean circle around
       the icon (not an ellipse stretched over the whole cell). */
    var dial = el("span", "__qDial");
    if (active) {
      var ring = el("span", "__qRing");
      ring.setAttribute("data-start", it.start || Date.now());
      ring.setAttribute("data-at", it.at || 0);
      dial.appendChild(ring);
    }
    var b = btn("__qClockBtn", clockTitle(it));
    b.innerHTML = clockIcon(it);
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      if (it.rearm) rearmTimer(it); else openScheduleModal(it);   /* rearm: one-click restart */
    });
    dial.appendChild(b);
    wrap.appendChild(dial);

    if (active) {
      var w = el("span", "__qWhen");
      w.setAttribute("data-at", it.at);
      w.setAttribute("title", clockTitle(it));
      w.textContent = fmtCountdown(it.at - Date.now());
      wrap.appendChild(w);
    } else if (it.missed || it.rearm || waiting) {
      var s = el("span", "__qState");
      s.setAttribute("title", clockTitle(it));
      s.textContent = it.missed ? "Missed · " + fmtClock(it.at)
        : it.rearm ? "Restart " + labelMins(Math.round((it.dur || 0) / 60000))
          : "Waiting · " + afterMins(it);
      wrap.appendChild(s);
    }
    return wrap;
  }

