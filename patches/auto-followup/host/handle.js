/* AUTOFOLLOWUP host runtime - part 3: the "__ccaf" message handler.

   Hooked into each chat webview's own onDidReceiveMessage, ahead of the app's
   protocol switch, so these messages never reach it. Returning true means
   "handled, stop here".

   Every reply carries the rid the panel sent, because two panels share this host
   and both may have a responder armed. Without it a slow run in one window would
   answer the other one's turn. */
globalThis.__ccAf = globalThis.__ccAf || (function () {
  var running = {};             /* rid -> child, so a stop can kill in flight */

  function post(wv, msg) {
    try {
      var r = wv.postMessage(msg);
      if (r && typeof r.then === "function") r.then(function () {}, function () {});
      return true;
    } catch (e) { return false; }
  }

  /* Every panel that has spoken to this host, so an edit made in one window
     reaches the loop running in another. The panel keeps the settings it
     enforces itself - autosend, the context mode, max_turns, the once gate - in
     the list it was last sent, and it only asks again when it has none at all.
     So a save that answered only the window it came from left every other
     window running on the settings it happened to load, with nothing on screen
     to say so. The prompts and the model were never affected: those are read
     from the file on every run.

     A disposed webview throws on postMessage, which is how it is dropped -
     there is no dispose event on this side of the bridge. */
  var panels = [];

  function remember(wv) {
    if (!wv || typeof wv.postMessage !== "function") return;
    if (panels.indexOf(wv) >= 0) return;
    panels.push(wv);
    if (panels.length > 32) panels.shift();
  }

  function openFolder() {
    try {
      var vscode = require("vscode");
      vscode.env.openExternal(vscode.Uri.file(globalThis.__ccAfStore.root()));
    } catch (e) {}
  }

  /* Export writes wherever the user points the save dialog; the ledger is theirs
     and this patch does not decide where it lives. */
  function exportClaims(lines) {
    try {
      var vscode = require("vscode"), fs = require("fs");
      vscode.window.showSaveDialog({ filters: { Markdown: ["md"], Text: ["txt"] } })
        .then(function (uri) {
          if (!uri) return;
          try { fs.writeFileSync(uri.fsPath, (lines || []).join("\n") + "\n", "utf8"); } catch (e) {}
        });
    } catch (e) {}
  }

  function sendList(wv) {
    globalThis.__ccAfStore.seedIfEmpty(globalThis.__ccAfSamples);
    post(wv, { type: "__ccaf", op: "list", items: globalThis.__ccAfStore.list(),
               root: globalThis.__ccAfStore.root() });
  }

  /* Not just the window that saved: the same responder can be armed in several,
     and the others have no way to know the file changed. */
  function broadcastList(wv) {
    remember(wv);
    for (var i = panels.length - 1; i >= 0; i--) {
      if (!post(panels[i], { type: "__ccaf", op: "list",
                             items: globalThis.__ccAfStore.list(),
                             root: globalThis.__ccAfStore.root() })) panels.splice(i, 1);
    }
  }

  function doRun(wv, msg) {
    var rid = msg.rid;
    var r = globalThis.__ccAfStore.read(msg.id);
    if (!r) { post(wv, { type: "__ccaf", op: "result", rid: rid, error: "responder not found" }); return; }
    /* Deltas are forwarded as they arrive so the panel can show the answer being
       written. They are for looking at only: nothing is ever built from them, and
       the result message remains the only thing the loop acts on. Dropped if the
       webview has gone, and capped so a runaway cannot flood it. */
    var sent = 0;
    function onChunk(kind, text) {
      if (sent > 262144) return;
      sent += text.length;
      try { post(wv, { type: "__ccaf", op: "chunk", rid: rid, kind: kind, text: text }); } catch (e) {}
    }
    var child = globalThis.__ccAfRun.run(r, msg.ctx || {}, function (res) {
      delete running[rid];
      res.type = "__ccaf"; res.op = "result"; res.rid = rid;
      post(wv, res);
    }, onChunk);
    if (child) running[rid] = child;
  }

  /* Killing the in-flight run is what makes the stop button honest: without it a
     turn already being composed would still arrive and be sent after the user
     had asked for silence. */
  function cancel(rid) {
    var c = rid ? running[rid] : null;
    if (c) { try { c.kill(); } catch (e) {} delete running[rid]; }
    if (!rid) {
      Object.keys(running).forEach(function (k) {
        try { running[k].kill(); } catch (e) {}
        delete running[k];
      });
    }
  }

  function handle(msg, wv) {
    if (!msg || msg.type !== "__ccaf") return false;
    /* Every panel that speaks is a panel that has to be told when a responder
       changes - registering only on 'list' would miss one that had already
       loaded before this code did. */
    remember(wv);
    try {
      if (msg.op === "list") sendList(wv);
      else if (msg.op === "run") doRun(wv, msg);
      else if (msg.op === "cancel") cancel(msg.rid);
      else if (msg.op === "save") { globalThis.__ccAfStore.save(msg.responder); broadcastList(wv); }
      else if (msg.op === "delete") { globalThis.__ccAfStore.remove(msg.id); broadcastList(wv); }
      else if (msg.op === "folder") openFolder();
      else if (msg.op === "export") exportClaims(msg.lines);
    } catch (e) {
      try { post(wv, { type: "__ccaf", op: "result", rid: msg.rid, error: String(e && e.message) }); } catch (e2) {}
    }
    return true;
  }

  return { handle: handle };
})();
