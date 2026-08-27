  /* ---------- Per-session persistence (localStorage, survives restart) ----------
     The app itself persists prefs in localStorage, so it is durable in this
     webview. The queue is keyed by the active session id (read off the root
     component's props) so each chat keeps its own queue, and it follows the
     user when they switch sessions. A restored queue is always parked
     (paused) - nothing auto-fires when Cursor reopens; the user releases it
     with the panel's play button. */
  var _curSid = null, _saveT = null, _sidWarned = 0;

  function qKey(sid) { return "ccq:" + sid; }

  /* The id may be a plain string OR a signal ({value}) - the app stores
     activeSessionId as a signal (this.activeSessionId.value), so unwrap both. */
  function sidFromVal(v) {
    if (typeof v === "string" && v) return v;
    if (v && typeof v === "object" && typeof v.value === "string" && v.value) return v.value;
    return null;
  }
  function readSid(props) {
    if (!props) return null;
    return sidFromVal(props.activeSessionId) || sidFromVal(props.sessionId);
  }

  /* The webview URL carries the conversation session id as ?session=<uuid>
     (confirmed via the in-webview probe). That is the fastest + most reliable
     source - available immediately, no waiting for React, and stable across
     reloads. Fall back to the reachable session object, then a fiber walk
     (activeSessionId is NOT on the composer's ancestor chain, so that is a
     genuine last resort). */
  function getSessionId() {
    try {
      var m = (typeof location !== "undefined" && location.href || "").match(/[?&]session=([0-9a-fA-F][0-9a-fA-F-]{7,})/);
      if (m) return m[1];
    } catch (e) {}
    try {
      var s = getSession();
      if (s) { var c = sidFromVal(s.sessionId) || sidFromVal(s.id) || (s.info && sidFromVal(s.info.sessionId)); if (c) return c; }
    } catch (e) {}
    var anchors = [inp(), qs('[class*="messageInputContainer"]'), qs('[class*="composer"]')];
    for (var a = 0; a < anchors.length; a++) {
      var f = fiberOf(anchors[a]), d = 0;
      while (f && d < 600) {
        var sid = readSid(f.memoizedProps);
        if (sid) return sid;
        f = f.return; d++;
      }
    }
    return null;
  }

  function serialize(withFiles) {
    return JSON.stringify({
      p: paused,
      c: collapsed ? 1 : 0,
      items: Q.map(function (it) {
        var o = { t: it.text };
        if (it.off) o.o = 1;
        if (it.auto) o.a = 1;
        if (isScheduled(it)) { o.md = it.mode; if (it.at) { o.at = it.at; o.st = it.start; } if (it.dur) o.du = it.dur; }
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
            mode: "queue", at: null, start: null, dur: null, missed: false, rearm: false, auto: !!o.a
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
            it.mode = "timer"; it.dur = o.du || null; it.rearm = true;
          } else if (o.md === "after") {
            it.mode = "after"; it.dur = o.du || null;   /* un-armed; re-arms when it reaches the front */
          }
          Q.push(it);
        });
      }
    } catch (e) { Q.length = 0; }
    if (Q.length) paused = true;   /* restored batch is held - never auto-fire on load */
    ccLog("queue", "loadQueue", qKey(sid), "restored=" + Q.length);
    render();
  }

  /* Load the active session's queue, and swap when the user changes session. */
  function syncSession() {
    var sid = getSessionId();
    if (!sid) { if (!_sidWarned) { _sidWarned = 1; ccLog("queue", "session id NOT FOUND - persistence disabled"); } return; }
    if (sid === _curSid) return;
    _sidWarned = 0;
    ccLog("queue", "session resolved", sid, "items=" + Q.length);
    var first = _curSid === null;
    _curSid = sid;
    /* If items were queued before the id first resolved, adopt them into this
       session instead of wiping them with the stored (likely empty) queue. */
    if (first && Q.length) { saveQueue(); return; }
    loadQueue(sid);
  }
