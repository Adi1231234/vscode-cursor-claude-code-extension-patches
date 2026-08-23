
  /* ---------- Background commands ----------
     A command backgrounded with run_in_background announces its log path only in
     the text of its own tool_result, so that text is the one place to learn it. */

  var BG_MARK = "Command running in background with ID: ";
  var BG_PATH = "Output is being written to: ";

  function scanBashResult(text) {
    var i = text.indexOf(BG_MARK);
    if (i < 0) return null;
    var from = i + BG_MARK.length;
    var dot = text.indexOf(".", from);
    var id = (dot < 0 ? text.slice(from) : text.slice(from, dot)).trim();
    var k = text.indexOf(BG_PATH);
    if (!id || k < 0) return null;
    var rest = text.slice(k + BG_PATH.length);
    var end = rest.indexOf(". You will be notified");
    return { id: id, path: (end < 0 ? rest : rest.slice(0, end)).trim() };
  }

  /* Called for the main thread's tool results and for a subagent's own, so a
     command a subagent backgrounded gets its row and its log path too. */
  function scanForBackgroundShells(content) {
    for (var i = 0; i < content.length; i++) {
      var c = content[i];
      if (!c || c.type !== "tool_result") continue;
      var hit = scanBashResult(resultText(c));
      if (!hit) continue;
      var t = task(hit.id);
      t.type = "local_bash";
      t.seenLive = true;
      t.onDisk = true;
      if (c.tool_use_id) t.toolUseId = c.tool_use_id;
      noteLogPath(t, hit.path, "text");
      changed();
    }
  }
