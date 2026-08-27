
  /* ---------- Detail pane ----------
     Header, a view toolbar (filter / wrap / follow), the feed itself, and the task
     actions at the bottom. Four sources behind one view: a subagent still in memory,
     an older subagent's transcript jsonl, a workflow's progress array, and any other
     task's .output text. Append-only, so the scroll position survives updates. */

  var paneEl = null, paneHead = null, paneBody = null, paneFoot = null;
  var backBtn = null, wrapBtn = null, followBtn = null, jumpBtn = null;
  var paneFor = null, paneMode = "", drawn = 0, follow = true, tailing = null, wrap = true;
  var lineTail = "", textLen = 0, bodyPre = null, toolEls = null, wfDrawn = null;

  function buildPane() {
    paneEl = el("div", "__bgPane");
    paneHead = el("div", "__bgPaneHead");
    paneEl.appendChild(paneHead);
    paneEl.appendChild(buildTools());
    paneBody = el("div", "__bgLog __ccScroll");
    paneBody.tabIndex = 0;
    paneBody.addEventListener("scroll", onPaneScroll);
    var wrapper = el("div", "__bgLogWrap");
    wrapper.appendChild(paneBody);
    jumpBtn = btn("__bgJump", "Jump to the latest output");
    jumpBtn.textContent = "Jump to latest";
    jumpBtn.addEventListener("click", function () { follow = true; stick(); syncFollow(); });
    wrapper.appendChild(jumpBtn);
    paneEl.appendChild(wrapper);
    paneFoot = el("div", "__bgPaneFoot");
    paneEl.appendChild(paneFoot);
    return paneEl;
  }

  function resetPane() {
    stopTailing();
    paneFor = null; paneMode = ""; drawn = 0; follow = true;
    lineTail = ""; textLen = 0; bodyPre = null; toolEls = Object.create(null); wfDrawn = null;
    resetFilter();
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
    if (!t) {
      resetPane(); clear(paneBody); clear(paneHead); clear(paneFoot);
      paneBody.appendChild(emptyState("No task selected", "Pick one from the list to read its log."));
      return;
    }
    var mode = modeFor(t);
    if (paneFor !== t.id || paneMode !== mode) {
      resetPane();
      paneFor = t.id; paneMode = mode;
      clear(paneBody);
      wantTail(t, mode);
      if (mode === "text") { bodyPre = el("pre", "__bgPre"); paneBody.appendChild(bodyPre); }
      if (mode === "none") {
        paneBody.appendChild(emptyState(isRunning(t) ? "Waiting for output" : "No log kept for this task",
          isRunning(t) ? "Nothing has been written yet; it will appear here as it arrives." : ""));
      }
      syncWrap();
    }
    drawHead(t);
    drawFoot(t);
    if (paneMode === "live") {
      /* pushLog trims the oldest entries once the log passes its cap, so the count
         drawn so far is compared against the total ever pushed, not the array. */
      var from = Math.max(0, drawn - (t.logDropped || 0));
      for (var i = from; i < t.log.length; i++) paneBody.appendChild(entryEl(t.log[i]));
      if (from < t.log.length) { drawn = (t.logDropped || 0) + t.log.length; trimFeed(); refilter(); }
      stick();
    } else if (paneMode === "workflow") {
      drawWorkflow(t);
    }
    syncFollow();
  }

  function drawHead(t) {
    clear(paneHead);
    var top = el("div", "__bgPaneTop");
    if (isRunning(t)) {
      var live = el("span", "__bgLive");
      live.setAttribute("aria-hidden", "true");
      top.appendChild(live);
    }
    top.appendChild(el("span", "__bgPaneName", oneLine(label(t), 120)));
    paneHead.appendChild(top);
    var bits = [typeWord(t), statusWord(t), duration(t)];
    if (t.tokens) bits.push(t.tokens.toLocaleString() + " tokens");
    if (t.toolUses) bits.push(t.toolUses + (t.toolUses === 1 ? " tool call" : " tool calls"));
    paneHead.appendChild(el("div", "__bgPaneMeta", bits.join(" \u00b7 ")));
    if (t.summary && isRunning(t)) paneHead.appendChild(el("div", "__bgPaneSummary", oneLine(t.summary, 160)));
    if (isRunning(t)) {
      var bar = el("div", "__bgProgress");
      bar.setAttribute("aria-hidden", "true");
      paneHead.appendChild(bar);
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
