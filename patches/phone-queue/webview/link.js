<script nonce="${__NONCE__}">/* PHONEQUEUE */(function () {
  /* The panel's end of /queue (see ../README.md): run what the host posts
     through the queue's own surface (window.__qRemote,
     prompt-queue/queue/remote-api.js) and send the answer back.

     The host posts only to the panel that spawned the asking CLI, so there is
     nothing to claim. What is left to check is that the panel still shows that
     conversation: a panel switched to another one keeps its old CLI alive, and
     a command from it must not land in the queue now on screen. An id not yet
     known here is no switch - in a new conversation the panel learns its id
     only after the first command has run.

     One command is the panel's own rather than the queue's: "drop", which the
     menu sends when nobody has answered its dialog for a while (an open dialog
     keeps the CLI busy, and the queue waits for it). The dialog is withdrawn
     the way its own X withdraws it - the request's reject(), with no interrupt,
     so the turn is not stopped and the queue is not parked.

     Injected after the queue's script, which defines __qRemote and __ccStore.
     Commands arrive as messages; nothing here polls. */
  var CH = "__ccphone";

  function store() {
    try { return globalThis.__ccStore && globalThis.__ccStore(); } catch (e) { return null; }
  }

  /* The store's own connection is the only sanctioned way to the host;
     reassigning acquireVsCodeApi blanks the panel (root CLAUDE.md). */
  function connection() {
    var s = store(), c = s && s.connection && s.connection.value;
    return c && typeof c.send === "function" ? c : null;
  }

  function log(a, b) {
    try { if (window.__ccLog) window.__ccLog("phone", a, b); } catch (e) {}
  }

  /* The question as the CLI drew it may differ in its spacing. */
  function squash(t) {
    return String(t || "").split("").filter(function (ch) { return ch.trim() !== ""; }).join("");
  }

  function drop(question) {
    var s = store(), reqs = (s && s.permissionRequests && s.permissionRequests.value) || [];
    var want = squash(question);
    var r = reqs.filter(function (x) {
      var qs = x && x.toolName === "AskUserQuestion" && x.inputs && x.inputs.questions;
      return qs && qs[0] && squash(qs[0].question) === want && typeof x.reject === "function";
    })[0];
    if (!r) return { error: "that menu is no longer open" };
    r.reject("closed: nobody answered the menu", false);
    log("menu closed: nobody answered it");
    return { error: "" };
  }

  function run(m) {
    var q = window.__qRemote;
    if (!q) return { error: "this panel has no queue" };
    var mine = q.sid();
    if (mine && m.sid && m.sid !== mine) {
      log("refused: another conversation", m.sid);
      return { error: "this panel has moved to another conversation" };
    }
    if (m.cmd && m.cmd.op === "drop") return drop(m.cmd.question);
    return q.run(m.cmd);
  }

  window.addEventListener("message", function (ev) {
    var m = ev && ev.data;
    if (!m || m.type !== CH || m.op !== "run") return;
    /* No way back means no answer: apply nothing, or the phone would be told
       it failed while the queue had changed. */
    var c = connection();
    if (!c) { log("not run: no host connection to answer on", m.id); return; }
    var result = run(m);
    try { c.send({ type: CH, op: "result", id: m.id, result: result }); } catch (e) { log("answer not sent", e && e.message); }
  });
})();</script>
