  /* ---------- Scheduling into a paused queue ----------
     A pause holds scheduled messages too, and the queue is often paused
     without anyone having asked: an Alt+Enter while idle parks it, and so does
     Stop. A timer set in that state reaches its moment and nothing happens,
     with nothing having said it would. So the schedule dialog says it at the
     one moment the choice is being made, and offers to resume in the same
     click - the pause itself keeps meaning what it means. */
  function resumeQueue() {
    paused = false;
    render();
    if (!isBusy() && Q.length) flush();
  }

  /* Only a schedule is held by the pause in a way worth saying: "Queue" has
     no time to miss. */
  function pausedBlocks(sel) { return paused && sel !== "queue"; }

  function pausedNote(sel) {
    return pausedBlocks(sel)
      ? "The queue is paused, so this will not send at its time until you resume it."
      : "";
  }

  /* ...and the queue itself keeps saying it for as long as it is true, since a
     pause can also arrive after the timer was set (Stop). A countdown that
     runs on while nothing will happen at zero is the state that has to be
     readable at a glance. The wording says which of the two is stopped: the
     timer keeps RUNNING, it is the queue that is paused - "on hold" next to a
     live countdown read as if the timer itself had stopped. */
  function runningTimers(t) {
    if (!paused) return 0;
    return Q.filter(function (it) { return !!it.at && it.at > t && !isParked(it); }).length;
  }

  function whenText(left) {
    if (left <= 0) return paused ? "due · queue paused" : "due";
    return fmtCountdown(left) + (paused ? " · queue paused" : "");
  }

  function heldBadgeText(n) {
    return !n ? "" : n === 1 ? "timer running" : n + " timers running";
  }

  /* Always in the header and empty (hidden by :empty) when nothing is running,
     so the once-a-second tick can switch it off at zero without a re-render. */
  function buildHeldBadge() {
    var b = el("span", "__qHeldBadge");
    b.textContent = heldBadgeText(runningTimers(Date.now()));
    b.setAttribute("title", "A timer is running but the queue is paused, so it will not send " +
      "when it reaches zero. Press play to let it send.");
    return b;
  }

  /* Past its moment and still here: say so rather than sit on 00:00, and name
     the reason - "due" with nothing happening is a state that has to be read. */
  function tickWhen(t) {
    var ws = panel.querySelectorAll(".__qWhen"), i;
    for (i = 0; i < ws.length; i++) window.__ccDom.setText(ws[i], whenText(+ws[i].getAttribute("data-at") - t));
    var b = panel.querySelector(".__qHeldBadge");
    if (b) window.__ccDom.setText(b, heldBadgeText(runningTimers(t)));
  }

  /* The secondary way out: schedule it and leave the hold where it is. Shown
     only while the choice exists, so a running queue keeps the dialog it had. */
  function buildKeepPaused(onClick) {
    var b = btn("__qBtnGhost __qKeepPaused");
    b.textContent = "Keep paused";
    b.addEventListener("click", onClick);
    return b;
  }
