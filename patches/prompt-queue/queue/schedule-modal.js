  /* ---------- Schedule modal (Queue / Timer / At time) ---------- */
  var TIMER_PRESETS = [5, 15, 30, 60, 120, 240];

  function openScheduleModal(it) {
    var sel = isScheduled(it) ? it.mode : "queue";
    var timerMins = it.dur ? Math.max(1, Math.round(it.dur / 60000)) : 30;
    var timeVal = toLocalValue(it.mode === "time" && it.at ? it.at : Date.now() + 3600000);

    /* The overlay, head, foot, Esc / backdrop dismissal and the focus trap all
       come from the shared shell; only Enter-to-commit is ours. */
    var sh = openShell({ title: "When to send", label: "Schedule message", icon: IC_CLOCK, onKey: onKey });
    var seg = el("div", "__qSeg");
    var body = el("div", "__qModalBody");
    var sum = el("div", "__qSummary");
    var err = el("div", "__qModalErr");

    function curAt() { return sel === "timer" ? Date.now() + timerMins * 60000 : sel === "time" ? new Date(timeVal).getTime() : 0; }
    function updateSummary() {
      if (sel === "after") { sum.textContent = "Sends " + labelMins(timerMins) + " after the message before it finishes."; return; }
      sum.textContent = (sel === "time" && isNaN(curAt())) ? "Pick a date and time." : fmtSummary(sel, curAt());
    }
    function close() { sh.close(); }
    function commit() {
      err.textContent = "";
      if (sel === "queue") { setSchedule(it, "queue"); return close(); }
      if (sel === "timer" || sel === "after") {
        if (!(timerMins >= 1)) { err.textContent = "Enter at least 1 minute."; return; }
        if (sel === "after") { setSchedule(it, "after", null, timerMins * 60000); return close(); }
        setSchedule(it, "timer", Date.now() + timerMins * 60000, timerMins * 60000); return close();
      }
      var at = new Date(timeVal).getTime();
      if (isNaN(at)) { err.textContent = "Pick a valid date and time."; return; }
      if (at <= Date.now() + 1000) { err.textContent = "Choose a time in the future."; return; }
      setSchedule(it, "time", at); return close();
    }
    function onKey(e) {
      if (e.key === "Enter" && e.target.type !== "datetime-local") { e.preventDefault(); commit(); }
    }
    function chip(label, on, fn) {
      var c = btn("__qChip" + (on ? " __qChipOn" : "")); c.textContent = label;
      c.addEventListener("click", fn); return c;
    }

    function queueBody() {
      var d = el("div", "__qOpt");
      d.textContent = "No timer - this message sends with the normal queue.";
      return d;
    }
    function durationBody() {
      var d = el("div", "__qOpt");
      var chips = el("div", "__qChips");
      TIMER_PRESETS.forEach(function (m) { chips.appendChild(chip(labelMins(m), m === timerMins, function () { timerMins = m; renderBody(); })); });
      var row = el("div", "__qCustom");
      var num = el("input", "__qNumIn"); num.type = "number"; num.min = "1"; num.value = timerMins;
      num.addEventListener("input", function () { timerMins = Math.max(1, parseInt(num.value, 10) || 0); syncChips(chips, TIMER_PRESETS, timerMins); updateSummary(); });
      var hint = el("span", "__qHint"); hint.textContent = sel === "after" ? "minutes after the previous one" : "minutes from now";
      row.appendChild(num); row.appendChild(hint);
      d.appendChild(chips); d.appendChild(row);
      return d;
    }
    function timeBody() {
      var d = el("div", "__qOpt");
      var chips = el("div", "__qChips");
      var dt = el("input", "__qDate"); dt.type = "datetime-local"; dt.value = timeVal; dt.min = toLocalValue(Date.now());
      dt.addEventListener("input", function () { timeVal = dt.value; updateSummary(); });
      quickTimes().forEach(function (p) { chips.appendChild(chip(p.label, false, function () { timeVal = toLocalValue(p.at); dt.value = timeVal; updateSummary(); })); });
      d.appendChild(chips); d.appendChild(dt);
      return d;
    }

    function renderBody() {
      body.innerHTML = ""; err.textContent = "";
      body.appendChild(sel === "queue" ? queueBody() : (sel === "timer" || sel === "after") ? durationBody() : timeBody());
      [].slice.call(seg.children).forEach(function (c) { c.classList.toggle("__qSegOn", c.getAttribute("data-k") === sel); });
      ok.textContent = sel === "queue" ? "Done" : "Schedule";
      updateSummary();
    }

    [["queue", "Queue"], ["timer", "Timer"], ["after", "After"], ["time", "At time"]].forEach(function (t) {
      var s = btn("__qSegBtn"); s.setAttribute("data-k", t[0]); s.textContent = t[1];
      s.addEventListener("click", function () { sel = t[0]; renderBody(); });
      seg.appendChild(s);
    });

    if (isScheduled(it)) {
      var clr = btn("__qBtnGhost __qClearBtn"); clr.textContent = "Clear";
      clr.addEventListener("click", function () { setSchedule(it, "queue"); close(); });
      sh.foot.appendChild(clr);
    }
    var cancel = btn("__qBtnGhost"); cancel.textContent = "Cancel";
    cancel.addEventListener("click", close);
    var ok = btn("__qBtnPrimary"); ok.textContent = "Schedule";
    ok.addEventListener("click", commit);
    sh.foot.appendChild(cancel); sh.foot.appendChild(ok);

    sh.box.appendChild(seg); sh.box.appendChild(body); sh.box.appendChild(sum); sh.box.appendChild(err);
    sh.mount();
    renderBody();
    try { (body.querySelector("input") || ok).focus(); } catch (e) {}
  }

