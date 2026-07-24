  /* ---------- Scheduling: model + formatting helpers ----------
     An item may carry a schedule: mode 'timer' | 'time' with an absolute
     target 'at' (ms) and a 'start' (ms, the ring baseline). No schedule =>
     plain 'queue' item, sent in FIFO order. 'at' in the future = pending;
     'at' reached = due (sent even while the queue is paused). */
  function isScheduled(it) { return it.mode === "timer" || it.mode === "time" || it.mode === "after"; }
  function isDue(it) { return it.at ? Date.now() >= it.at : false; }

  function setSchedule(it, mode, at, dur) {
    it.missed = false; it.rearm = false;   /* (re)scheduling clears any restart flag */
    if (mode === "after") {
      it.mode = "after"; it.at = null; it.start = null; it.dur = dur || 0;   /* armed later, when it reaches the front */
    } else if (mode === "timer" || mode === "time") {
      it.mode = mode; it.at = at; it.start = Date.now(); it.dur = dur || (at - it.start);
    } else {
      it.mode = "queue"; it.at = null; it.start = null; it.dur = null;
    }
    render();
  }

  /* Re-arm a timer that was paused by a restart: run its stored duration from now. */
  function rearmTimer(it) { setSchedule(it, "timer", Date.now() + (it.dur || 0), it.dur || 0); }

  function firstActiveIndex() {
    for (var k = 0; k < Q.length; k++) if (!Q[k].off && !Q[k].missed && !Q[k].rearm) return k;
    return -1;
  }

  /* 'after' items: start the dur countdown only once the item is first in line
     and the previous message has finished (idle, not paused). Moving it back
     resets it - it re-arms when it is at the front again. */
  function armAfterItems() {
    if (editing) return;   /* don't rebuild the panel while a position field is being edited */
    var first = firstActiveIndex(), changed = false, k, it;
    for (k = 0; k < Q.length; k++) {
      it = Q[k];
      if (it.mode !== "after") continue;
      if (k === first) {
        if (!it.at && !paused && !isBusy()) { it.start = Date.now(); it.at = it.start + (it.dur || 0); changed = true; }
      } else if (it.at) {
        it.at = null; it.start = null; changed = true;
      }
    }
    if (changed) render();
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function fmtClock(ms) {
    var d = new Date(ms), h = d.getHours(), hh = h % 12;
    if (hh === 0) hh = 12;
    return hh + ":" + pad2(d.getMinutes()) + " " + (h >= 12 ? "PM" : "AM");
  }

  /* Live time remaining: MM:SS under an hour, HH:MM:SS within a day,
     "Nd HH:MM:SS" beyond - e.g. 04:59 / 03:02:45 / 2d 06:10:00. */
  function fmtCountdown(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (d > 0) return d + "d " + pad2(h) + ":" + pad2(m) + ":" + pad2(sec);
    if (h > 0) return pad2(h) + ":" + pad2(m) + ":" + pad2(sec);
    return pad2(m) + ":" + pad2(sec);
  }

  /* Absolute timestamp incl. seconds, e.g. "Jul 24, 3:15:30 PM" (hover tooltip). */
  function fmtStamp(ms) {
    var d = new Date(ms), h = d.getHours(), hh = h % 12; if (hh === 0) hh = 12;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      ", " + hh + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds()) + " " + (h >= 12 ? "PM" : "AM");
  }

  function toLocalValue(ms) {
    var d = new Date(ms);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
      "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  function labelMins(m) { return m < 60 ? m + "m" : (m % 60 ? (Math.floor(m / 60) + "h" + (m % 60) + "m") : (m / 60 + "h")); }

  /* Plain-language confirmation of the choice - shown live so the user always
     sees exactly when the message will go out (a known clarity/confidence win). */
  function fmtSummary(mode, at) {
    if (mode === "queue") return "Sent in normal queue order when the queue runs.";
    if (!at || at <= Date.now()) return "Sends now.";
    var d = new Date(at);
    var mid = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
    var days = Math.round((mid(d) - mid(new Date())) / 86400000);
    var day = days === 0 ? "today" : days === 1 ? "tomorrow"
      : days > 1 && days < 7 ? d.toLocaleDateString(undefined, { weekday: "long" }).toLowerCase()
        : pad2(d.getMonth() + 1) + "/" + pad2(d.getDate());
    var extra = "";
    if (mode === "timer") { var mins = Math.round((at - Date.now()) / 60000); extra = mins < 60 ? " · in " + mins + " min" : ""; }
    return "Sends " + day + " at " + fmtClock(at) + extra;
  }

  /* Next occurrence of h:m (optionally +dayOffset days), always in the future. */
  function nextAt(h, m, dayOffset) {
    var d = new Date();
    if (dayOffset) d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  function quickTimes() {
    return [
      { label: "In 1 hour", at: Date.now() + 3600000 },
      { label: "This evening", at: nextAt(18, 0, 0) },
      { label: "Tonight", at: nextAt(21, 0, 0) },
      { label: "Tomorrow 9 AM", at: nextAt(9, 0, 1) },
      { label: "Tomorrow 2 PM", at: nextAt(14, 0, 1) }
    ];
  }

  function focusables(box) {
    return [].slice.call(box.querySelectorAll("button,input,[tabindex]")).filter(function (n) { return !n.disabled; });
  }
  function syncChips(container, values, current) {
    [].slice.call(container.children).forEach(function (c, i) { c.classList.toggle("__qChipOn", values[i] === current); });
  }

  /* Advance every visible countdown ring + tick the HH:MM:SS labels (cheap, 150ms). */
  function tickRings() {
    if (!panel) return;
    var t = Date.now(), rings = panel.querySelectorAll(".__qRing"), i;
    for (i = 0; i < rings.length; i++) {
      var r = rings[i], s = +r.getAttribute("data-start"), a = +r.getAttribute("data-at");
      var p = (!a || a <= s) ? 1 : (t - s) / (a - s);
      r.style.setProperty("--p", (p < 0 ? 0 : p > 1 ? 1 : p).toFixed(4));
    }
    var ws = panel.querySelectorAll(".__qWhen");
    for (i = 0; i < ws.length; i++) ws[i].textContent = fmtCountdown(+ws[i].getAttribute("data-at") - t);
  }

