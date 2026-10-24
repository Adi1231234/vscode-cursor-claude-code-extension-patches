  /* ---------- Per-session persistence (localStorage, survives restart) ----------
     The app itself persists prefs in localStorage, so it is durable in this
     webview. The queue is keyed by the active session id (read off the root
     component's props) so each chat keeps its own queue, and it follows the
     user when they switch sessions. A restored queue is always parked
     (paused) - nothing auto-fires when Cursor reopens; the user releases it
     with the panel's play button. */
  var _curSid = null, _saveT = null, _sidWarned = 0;

  function qKey(sid) { return "ccq:" + sid; }

  function serialize(withFiles) {
    return JSON.stringify({
      p: paused,
      c: collapsed ? 1 : 0,
      items: Q.map(function (it) {
        var o = { t: it.text };
        if (it.off) o.o = 1;
        if (it.resume) o.r = it.resume;   /* "reset" | "play" (limit-resume.js) */
        if (isScheduled(it)) { o.md = it.mode; if (it.at) { o.at = it.at; o.st = it.start; } if (it.dur) o.du = it.dur; if (it.hold) o.h = 1; }
        if (withFiles && it.files && it.files.length) {
          var f = it.files.filter(function (x) { return x.dataUrl; })
                          .map(function (x) { return { n: x.name, d: x.dataUrl }; });
          if (f.length) o.f = f;
        }
        return o;
      })
    });
  }

  function saveQueue() {
    if (!_curSid) return;
    var key = qKey(_curSid);
    ccLog("queue", "saveQueue", key, "n=" + Q.length);
    try {
      if (!Q.length) { localStorage.removeItem(key); return; }
      localStorage.setItem(key, serialize(true));
    } catch (e) {
      /* quota (large images): fall back to text-only so at least prompts survive */
      try { localStorage.setItem(key, serialize(false)); } catch (e2) {}
    }
  }

  function scheduleSave() {
    if (_saveT) clearTimeout(_saveT);
    _saveT = setTimeout(saveQueue, 300);
  }

  function loadQueue(sid) {
    Q.length = 0;
    paused = false;                    /* reset per-session hold before restoring */
    collapsed = false;
    try {
      var raw = localStorage.getItem(qKey(sid));
      if (raw) {
        var data = JSON.parse(raw) || {};
        if (data.p) paused = true;
        if (data.c) collapsed = true;   /* restore the minimized/collapsed panel state */
        (data.items || []).forEach(function (o) {
          var it = {
            id: ++idc,
            text: o.t || "",
            off: !!o.o,
            files: (o.f || []).map(function (x) { return { name: x.n, dataUrl: x.d, file: null }; }),
            mode: "queue", at: null, start: null, dur: null, hold: !!o.h, missed: false, rearm: false, resume: o.r || false
          };
          /* Restart policy (decided with the user):
             - 'time' still in the future -> keep ticking, fires at its time.
             - 'time' whose moment passed while closed -> flag MISSED (held, shown).
             - 'timer' -> a relative countdown loses its origin across a restart,
               so it becomes RE-ARM: inactive until the user restarts it in one click. */
          if (o.md === "time" && o.at) {
            it.mode = "time"; it.dur = o.du || null; it.at = o.at;
            if (o.at > Date.now()) it.start = o.st || Date.now();
            else it.missed = true;
          } else if (o.md === "timer") {
            it.mode = "timer"; it.dur = o.du || null; it.rearm = true; if (!("h" in o)) it.hold = true;   /* saved before the flag existed */
          } else if (o.md === "after") {
            it.mode = "after"; it.dur = o.du || null;   /* un-armed; re-arms when it reaches the front */
          }
          Q.push(it);
        });
      }
    } catch (e) { Q.length = 0; }
    /* Only if something would actually fire: a restore of nothing but parked
       items has nothing to hold back. */
    if (Q.some(function (it) { return !isParked(it); })) paused = true;
    ccLog("queue", "loadQueue", qKey(sid), "restored=" + Q.length);
    render();
  }
