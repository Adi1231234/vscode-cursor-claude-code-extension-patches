
  /* ---------- Host-fed log text ----------
     Everything the extension host tails arrives here: a command's plain .output
     and a subagent transcript's jsonl, both as byte-range deltas. */

  /* Host -> pane. Text arrives as byte-range deltas, so a jsonl line can be split
     across two of them; the tail is carried over. */
  function setPaneText(taskId, text, reset, skipped) {
    if (taskId !== paneFor || !paneBody) return;
    if (reset) {
      clear(paneBody); lineTail = ""; textLen = 0; drawn = 0; toolEls = Object.create(null);
      if (paneMode === "text") { bodyPre = el("pre", "__bgPre"); paneBody.appendChild(bodyPre); }
      return;
    }
    if (!text) return;
    if (skipped) paneBody.appendChild(el("div", "__bgSkip", Math.round(skipped / 1024) + " KB of earlier output omitted"));
    if (paneMode === "text") {
      if (!bodyPre) { bodyPre = el("pre", "__bgPre"); paneBody.appendChild(bodyPre); }
      textLen += text.length;
      bodyPre.appendChild(document.createTextNode(text));
      if (textLen > MAX_TEXT) { bodyPre.textContent = bodyPre.textContent.slice(-MAX_TEXT); textLen = MAX_TEXT; }
    } else if (paneMode === "jsonl") {
      lineTail += text;
      var lines = lineTail.split(NL);
      lineTail = lines.pop();
      for (var i = 0; i < lines.length; i++) drawJsonl(lines[i]);
    }
    stick();
  }

  function drawJsonl(line) {
    if (!line || line.charAt(0) !== "{") return;
    var o;
    try { o = JSON.parse(line); } catch (e) { return; }
    var content = o && o.message && o.message.content;
    if (!Array.isArray(content)) return;
    for (var i = 0; i < content.length; i++) {
      var entry = blockEntry(content[i]);
      if (entry) paneBody.appendChild(entryEl(entry));
    }
    trimFeed();
  }
