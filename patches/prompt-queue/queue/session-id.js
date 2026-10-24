  /* ---------- Which conversation the queue belongs to ----------
     The queue is kept per conversation (persist.js); this reads the id of the
     one on screen and swaps the queue when it changes. */

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

  /* The page moved from a conversation to one that has no id yet - the
     desktop Code tab's "New session" page, until its first message creates
     one. The queue it showed stays saved under its own conversation and the
     page starts empty: left in place, it would be sent into the new chat. What
     is queued here is adopted by the conversation the page then becomes (the
     first-resolve branch below). */
  function leaveSession() {
    if (_saveT) { clearTimeout(_saveT); _saveT = null; }
    saveQueue();
    ccLog("queue", "left", qKey(_curSid), "for a page with no conversation yet");
    _curSid = null;
    Q.length = 0;
    paused = false;
    collapsed = false;
    render();
  }

  /* Load the active session's queue, and swap when the user changes session. */
  function syncSession() {
    var sid = getSessionId();
    if (!sid) {
      if (_curSid !== null) leaveSession();
      if (!_sidWarned) { _sidWarned = 1; ccLog("queue", "session id NOT FOUND - persistence disabled"); }
      return;
    }
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
