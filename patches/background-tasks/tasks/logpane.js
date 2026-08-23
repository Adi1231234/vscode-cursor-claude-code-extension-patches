
  /* ---------- Live log pane ----------
     Three sources behind one view: a subagent still in memory (entries straight off
     the stream), a subagent recovered from disk (its transcript jsonl, tailed by the
     host) and any other task (its .output text, also tailed). Append-only, so the
     scroll position survives every update. */

  var paneEl = null, paneHead = null, paneBody = null, paneFoot = null;
  var paneFor = null, paneMode = "", drawn = 0, follow = true;
  var lineTail = "", textLen = 0, bodyPre = null, toolEls = null;

  function buildPane() {
    paneEl = el("div", "__bgPane");
    paneHead = el("div", "__bgPaneHead");
    paneBody = el("div", "__bgLog");
    paneFoot = el("div", "__bgPaneFoot");
    paneBody.addEventListener("scroll", function () {
      follow = paneBody.scrollHeight - paneBody.scrollTop - paneBody.clientHeight < 24;
    });
    paneEl.appendChild(paneHead);
    paneEl.appendChild(paneBody);
    paneEl.appendChild(paneFoot);
    return paneEl;
  }

  function resetPane() {
    paneFor = null; paneMode = ""; drawn = 0; follow = true;
    lineTail = ""; textLen = 0; bodyPre = null; toolEls = Object.create(null);
  }

  function modeFor(t) {
    if (t.log.length > 0) return "live";
    if (t.logPath) return t.logKind === "agent" ? "jsonl" : "text";
    return "none";
  }

  function renderPane(t) {
    if (!paneEl) return;
    if (!t) { resetPane(); clear(paneBody); clear(paneHead); clear(paneFoot); return; }
    var mode = modeFor(t);
    if (paneFor !== t.id || paneMode !== mode) {
      var switching = paneFor !== t.id;
      resetPane();
      paneFor = t.id; paneMode = mode;
      clear(paneBody);
      if (mode === "text" || mode === "jsonl") { if (switching) openLog(t); }
      if (mode === "text") { bodyPre = el("pre", "__bgPre"); paneBody.appendChild(bodyPre); }
      if (mode === "none") paneBody.appendChild(el("div", "__bgEmpty", "No log for this task."));
    }
    drawHead(t);
    drawFoot(t);
    if (paneMode === "live") {
      for (; drawn < t.log.length; drawn++) paneBody.appendChild(entryEl(t.log[drawn]));
      stick();
    }
  }

  function drawHead(t) {
    clear(paneHead);
    var name = el("div", "__bgPaneName", oneLine(label(t), 110));
    var meta = el("div", "__bgPaneMeta");
    var bits = [typeWord(t), statusWord(t), duration(t)];
    if (t.tokens) bits.push(t.tokens + " tokens");
    if (t.toolUses) bits.push(t.toolUses + (t.toolUses === 1 ? " tool call" : " tool calls"));
    meta.textContent = bits.join(" · ");
    paneHead.appendChild(name);
    paneHead.appendChild(meta);
  }

  function drawFoot(t) {
    clear(paneFoot);
    if (isRunning(t)) {
      var stop = btn("__bgFootBtn", "Stop task");
      stop.textContent = "Stop";
      stop.addEventListener("click", function () { stopTask(t); });
      paneFoot.appendChild(stop);
    }
    var copy = btn("__bgFootBtn", "Copy log");
    copy.textContent = "Copy";
    copy.addEventListener("click", function () {
      try { navigator.clipboard.writeText(paneBody.innerText || ""); } catch (e) {}
    });
    paneFoot.appendChild(copy);
    if (t.logPath) {
      var open = btn("__bgFootBtn", "Open log in editor");
      open.textContent = "Open in editor";
      open.addEventListener("click", function () { revealLog(t); });
      paneFoot.appendChild(open);
    }
  }

  function stick() {
    if (follow) paneBody.scrollTop = paneBody.scrollHeight;
  }

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
  }
