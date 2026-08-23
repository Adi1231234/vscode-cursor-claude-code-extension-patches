
  /* BGTASKS host runtime - part 3: the "__ccbg" message handler.

     Hooked into each chat webview's own onDidReceiveMessage, ahead of the app's
     protocol switch, so our messages never reach it (it would log them as unknown).
     Returning true means "handled, stop here". */

  function reveal(file) {
    if (!file) return;
    try {
      var vscode = require("vscode");
      vscode.window.showTextDocument(vscode.Uri.file(file), { preview: false });
    } catch (e) {}
  }

  function queryFor(comms, channelId) {
    try {
      if (!comms || !comms.channels || !channelId) return null;
      var ch = comms.channels.get(channelId);
      return ch && ch.query ? ch.query : null;
    } catch (e) { return null; }
  }

  function stopTask(comms, channelId, taskId) {
    var q = queryFor(comms, channelId);
    if (q && typeof q.stopTask === "function") Promise.resolve(q.stopTask(taskId)).catch(function () {});
  }

  function backgroundTask(comms, channelId, toolUseId) {
    var q = queryFor(comms, channelId);
    if (q && typeof q.backgroundTasks === "function") Promise.resolve(q.backgroundTasks(toolUseId)).catch(function () {});
  }

  function handle(msg, wv, comms) {
    if (!msg || msg.type !== "__ccbg") return false;
    try {
      if (msg.op === "list") post(wv, { type: "__ccbg", op: "list", items: listHistory(msg.sid, msg.hintDir) });
      else if (msg.op === "open") openTask(wv, msg.taskId, msg.path, msg.fromStart === true);
      else if (msg.op === "close") closeTask(msg.taskId);
      else if (msg.op === "reveal") reveal(msg.path);
      else if (msg.op === "stop") stopTask(comms, msg.channelId, msg.taskId);
      else if (msg.op === "background") backgroundTask(comms, msg.channelId, msg.toolUseId);
    } catch (e) {}
    return true;
  }

  return { handle: handle };
})();
