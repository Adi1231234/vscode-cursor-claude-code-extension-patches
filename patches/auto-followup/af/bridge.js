  /* ---------- Host bridge ----------
     Everything that touches a file or spawns a process happens in the extension
     host; this side only asks. The route is the store's own connection, because
     reassigning window.acquireVsCodeApi silently blanks the whole panel - the same
     rule ccStore.js states and background-tasks follows.

     Replies are matched on rid rather than "the next result wins". Two panels
     share one host, and a slow run in one window must not be delivered as the
     other window's follow-up. */
  var firstSendAt = 0;

  /* Everything the panel says to the host goes through the app's own session
     store, and that store is not on a global: it is found by walking the React
     fiber tree up from the composer input. So a send before the app has rendered
     its composer has nowhere to go, and the failure says which half is missing -
     the input, the store, or the connection - because they fail at different
     moments and the answer decides what to do about it. */
  function send(msg) {
    var why = "";
    try {
      var e = globalThis.__ccInput ? globalThis.__ccInput() : null;
      var s = globalThis.__ccStore();
      var c = s && s.connection && s.connection.value;
      if (c && typeof c.send === "function") {
        if (!firstSendAt) {
          firstSendAt = Date.now();
          log("bridge ready after", String(firstSendAt - startedAt) + "ms");
        }
        c.send(msg);
        return true;
      }
      why = !e ? "no composer input yet" : (!s ? "input but no store" : "store but no connection");
    } catch (e2) { why = "threw: " + (e2 && e2.message); }
    log("bridge send failed", msg && msg.op, why);
    return false;
  }

  /* Through the queue, which already resolves this and caches it. Its own note
     says where it really lives, confirmed with an in-webview probe: the webview
     URL carries ?session=<uuid>, and the store object does NOT carry it - the
     React props do, on a chain the composer is not on. An earlier version here
     read s.sessionId directly, got "" every time, and would have keyed every
     conversation's arming and claims to one shared bucket. */
  function sessionId() {
    try {
      var q = qApi();
      return (q && q.sid && q.sid()) || "";
    } catch (e) { return ""; }
  }

  /* Only so the CLI has a valid directory to start in - the responder is handed
     its context explicitly and never reads the project. Nothing in this repo
     reads a cwd off the store, so this is a hint and not a fact: run.js checks it
     and falls back to the home directory, which is correct for this use. */
  function cwdHint() {
    try {
      var s = globalThis.__ccStore();
      var v = s && s.cwd;
      if (v && typeof v === "object" && "value" in v) v = v.value;
      return typeof v === "string" ? v : "";
    } catch (e) { return ""; }
  }

  function requestList() {
    send({ type: "__ccaf", op: "list" });
  }

  function requestRun(id, ctx) {
    rid += 1;
    pending = true;
    var mine = sid + ":" + rid;
    send({ type: "__ccaf", op: "run", rid: mine, id: id, ctx: ctx });
    return mine;
  }

  function cancelRun() {
    send({ type: "__ccaf", op: "cancel", rid: sid + ":" + rid });
    pending = false;
  }

  var inflight = "";

  function onHostMessage(m) {
    if (!m || m.type !== "__ccaf") return;
    if (m.op === "list") {
      list = Array.isArray(m.items) ? m.items : [];
      listSeen = true;
      if (m.build) {
        buildInfo = m.build;
        /* Readable from a console or a probe without opening anything. */
        try { window.__ccBuild = m.build; } catch (e) {}
        if (m.build.stale) log("a newer build is on disk", m.build.onDisk, "running " + m.build.running);
      }
      meta = armed ? findResponder(armed) : null;
      /* An armed responder whose file was deleted outside the dialog must not
         keep running against a definition nobody can see any more. */
      if (armed && !meta) { disarm("the responder file is gone"); }
      renderAll();
      /* The picker may be open and showing the emptiness it was built with. */
      try { refreshMenu(); } catch (e) {}
      /* And the one line in the dialog that is about the file, not the draft. */
      try { refreshSavedAt(); } catch (e) {}
      return;
    }
    if (m.op === "chunk") {
      /* Purely a view update. The loop never reads these; the result message
         stays the only thing it acts on. */
      try { liveAppend(m.rid, m.kind, m.text); } catch (e) {}
      return;
    }
    if (m.op === "result") {
      if (m.rid !== inflight) return;          /* another panel's run, or a cancelled one */
      inflight = "";
      pending = false;
      onResult(m);
    }
  }

  window.addEventListener("message", function (ev) {
    try { onHostMessage(ev && ev.data); } catch (e) {}
  });

  function findResponder(id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
