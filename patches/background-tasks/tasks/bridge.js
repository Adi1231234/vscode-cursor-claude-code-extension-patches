
  /* ---------- Extension-host bridge ----------
     Out through the connection object the store already holds - never by wrapping
     window.acquireVsCodeApi, which blanks the panel. Back in on the same window
     "message" event, under a top-level type the app's own listener ignores. */

  function store() {
    try { return globalThis.__ccStore(); } catch (e) { return null; }
  }

  function hostSend(msg) {
    try {
      var st = store();
      var c = st && st.connection && st.connection.value;
      if (!c || typeof c.send !== "function") return false;
      msg.type = CH;
      c.send(msg);
      return true;
    } catch (e) { return false; }
  }

  function channelId() {
    var st = store();
    return (st && st.claudeChannelId) || "";
  }

  /* The session id is learned from the stream, so the dialog can open before it is
     known; ask again on the next pass rather than losing the history for good. */
  var historyAsked = false;

  function askHistory() {
    if (historyAsked || !SID) return;
    historyAsked = hostSend({ op: "list", sid: SID, hintDir: HINT_DIR });
  }

  function forgetHistoryRequest() { historyAsked = false; }

  function openLog(t) {
    if (!t.logPath) return false;
    return hostSend({ op: "open", taskId: t.id, path: t.logPath });
  }

  function closeLog(id) { hostSend({ op: "close", taskId: id }); }

  function revealLog(t) {
    if (t.logPath) hostSend({ op: "reveal", path: t.logPath });
  }

  function stopTask(t) {
    hostSend({ op: "stop", channelId: channelId(), taskId: t.id });
  }

  /* Ctrl+B semantics for one task: let the turn continue without waiting for it. */
  function sendToBackground(t) {
    if (!t.toolUseId) return;
    hostSend({ op: "background", channelId: channelId(), toolUseId: t.toolUseId });
  }

  /* Host -> panel. "reset" starts a fresh pane, "delta" appends, "gone" means the
     file was removed underneath us and the row goes with it. */
  function onHostMessage(m) {
    if (m.op === "list" && Array.isArray(m.items)) {
      var listed = Object.create(null);
      for (var i = 0; i < m.items.length; i++) {
        var it = m.items[i];
        if (!it || !it.taskId) continue;
        listed[it.taskId] = true;
        var t = task(it.taskId);
        t.onDisk = true;
        if (!t.logPath || it.kind === "agent") noteLogPath(t, it.path, it.kind);
        if (!t.seenLive) {
          t.type = it.kind === "agent" ? "local_agent" : t.type;
          t.status = "completed";
          t.endedAt = t.endedAt || it.mtime || Date.now();
          t.startedAt = Math.min(t.startedAt, t.endedAt);
        }
      }
      pruneAgainst(listed);
      return changed();
    }
    if (!m.taskId) return;
    if (m.op === "reset") { setPaneText(m.taskId, "", true); return; }
    if (m.op === "delta") { setPaneText(m.taskId, m.text, false, m.skipped); return; }
    if (m.op === "gone") {
      var g = TASKS[m.taskId];
      if (g) { g.onDisk = false; g.logPath = ""; prune(); changed(); }
      return;
    }
  }
