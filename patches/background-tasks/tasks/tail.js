
  /* ---------- Host-fed log text ----------
     Everything the extension host tails arrives here: a command's plain .output
     and a subagent transcript's jsonl, both as byte-range deltas. The plain text is
     also kept as a string, because filtering has to rebuild from the full buffer
     rather than from whatever is currently on screen. */

  var textBuf = "";

  function setPaneText(taskId, text, reset, skipped) {
    if (taskId !== paneFor || !paneBody) return;
    if (reset) {
      clear(paneBody); lineTail = ""; textLen = 0; textBuf = ""; drawn = 0;
      toolEls = Object.create(null);
      if (paneMode === "text") { bodyPre = el("pre", "__bgPre"); paneBody.appendChild(bodyPre); }
      return;
    }
    if (!text) return;
    if (skipped) paneBody.appendChild(el("div", "__bgSkip", Math.round(skipped / 1024) + " KB of earlier output omitted"));
    if (paneMode === "text") {
      if (!bodyPre) { bodyPre = el("pre", "__bgPre"); paneBody.appendChild(bodyPre); }
      textBuf += text;
      textLen = textBuf.length;
      if (textLen > MAX_TEXT) { textBuf = textBuf.slice(-MAX_TEXT); textLen = MAX_TEXT; }
      refilter();
      if (!filterActive()) bodyPre.textContent = textBuf;
    } else if (paneMode === "jsonl") {
      lineTail += text;
      var lines = lineTail.split(NL);
      lineTail = lines.pop();
      for (var i = 0; i < lines.length; i++) drawJsonl(lines[i]);
      trimFeed();
      refilter();
    }
    stick();
  }

  function filterActive() { return !!(findInput && findInput.value.trim()); }

  function drawJsonl(line) {
    if (!line || line.charAt(0) !== "{") return;
    var o;
    try { o = JSON.parse(line); } catch (e) { return; }
    var content = o && o.message && o.message.content;
    if (!Array.isArray(content)) return;
    var at = o.timestamp ? Date.parse(o.timestamp) : 0;
    for (var i = 0; i < content.length; i++) {
      var entry = blockEntry(content[i]);
      if (entry) { if (at) entry.at = at; paneBody.appendChild(entryEl(entry)); }
    }
  }
