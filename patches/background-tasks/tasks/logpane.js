
  /* ---------- Live log pane ----------
     Three sources behind one view: a subagent still in memory (entries straight off
     the stream), a subagent recovered from disk (its transcript jsonl, tailed by the
     host) and any other task (its .output text, also tailed). Append-only, so the
     scroll position survives every update. */

  var paneEl = null, paneHead = null, paneBody = null, paneFoot = null;
  var paneFor = null, paneMode = "", drawn = 0, follow = true, tailing = null;
  var lineTail = "", textLen = 0, bodyPre = null, toolEls = null, wfDrawn = null;

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
    stopTailing();
    paneFor = null; paneMode = ""; drawn = 0; follow = true;
    lineTail = ""; textLen = 0; bodyPre = null; toolEls = Object.create(null); wfDrawn = null;
  }

  /* One host tail at a time, tracked by the id it belongs to rather than by the
     selection, so a mode change in place opens and closes it just as a click does. */
  function stopTailing() {
    if (tailing) { closeLog(tailing); tailing = null; }
  }

  function wantTail(t, mode) {
    var want = (mode === "text" || mode === "jsonl") ? t.id : null;
    if (tailing === want) return;
    stopTailing();
    if (want && openLog(t)) tailing = want;
  }

  function modeFor(t) {
    if (t.workflowProgress && t.workflowProgress.length) return "workflow";
    if (t.log.length > 0) return "live";
    if (t.logPath) return t.logKind === "agent" ? "jsonl" : "text";
    return "none";
  }

  function renderPane(t) {
    if (!paneEl) return;
    if (!t) { resetPane(); clear(paneBody); clear(paneHead); clear(paneFoot); return; }
    var mode = modeFor(t);
    if (paneFor !== t.id || paneMode !== mode) {
      resetPane();
      paneFor = t.id; paneMode = mode;
      clear(paneBody);
      wantTail(t, mode);
      if (mode === "text") { bodyPre = el("pre", "__bgPre"); paneBody.appendChild(bodyPre); }
      if (mode === "none") paneBody.appendChild(el("div", "__bgEmpty", "No log for this task."));
    }
    drawHead(t);
    drawFoot(t);
    if (paneMode === "live") {
      /* pushLog trims the oldest entries once the log passes its cap, so the count
         drawn so far is compared against the total ever pushed, not the array. */
      var from = Math.max(0, drawn - (t.logDropped || 0));
      for (var i = from; i < t.log.length; i++) paneBody.appendChild(entryEl(t.log[i]));
      drawn = (t.logDropped || 0) + t.log.length;
      trimFeed();
      stick();
    } else if (paneMode === "workflow") {
      drawWorkflow(t);
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
    if (isRunning(t) && !t.backgrounded && t.toolUseId) {
      var bg = btn("__bgFootBtn", "Let this task run in the background");
      bg.textContent = "Run in background";
      bg.addEventListener("click", function () { sendToBackground(t); });
      paneFoot.appendChild(bg);
    }
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

  /* The feed is append-only, so without this a task that runs for hours leaves a
     node per entry behind. Same cap the store keeps. */
  function trimFeed() {
    while (paneBody.childElementCount > MAX_LOG) paneBody.removeChild(paneBody.firstElementChild);
  }
