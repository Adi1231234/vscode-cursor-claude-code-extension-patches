
  /* ---------- Workflow progress ----------
     A local_workflow has no message log of its own; what it reports is the
     workflow_progress array on task_progress, one entry per phase, per spawned
     agent and per log line. */

  /* A workflow's progress array is replaced wholesale on every task_progress and its
     entries are updated in place by index, so it is redrawn rather than appended -
     but only when a new array actually arrived. */
  function drawWorkflow(t) {
    if (wfDrawn === t.workflowProgress) return;
    wfDrawn = t.workflowProgress;
    clear(paneBody);
    for (var i = 0; i < wfDrawn.length; i++) paneBody.appendChild(workflowEl(wfDrawn[i]));
    stick();
  }

  function workflowEl(e) {
    var kind = e && e.type === "workflow_phase" ? "phase" : e && e.type === "workflow_log" ? "log" : "agent";
    var box = el("div", "__bgEntry __bgWf __bgWf-" + kind);
    var head = el("div", "__bgEntryHead");
    var title = e.phaseTitle && e.label ? e.phaseTitle + ": " + e.label : (e.label || e.phaseTitle || e.message || e.text || kind);
    head.appendChild(el("span", "__bgToolName", oneLine(title, 110)));
    var bits = [];
    if (e.state) bits.push(e.state);
    if (e.tokens) bits.push(e.tokens + " tokens");
    if (e.toolCalls) bits.push(e.toolCalls + " tool calls");
    if (bits.length) head.appendChild(el("span", "__bgToolArg", bits.join(" · ")));
    box.appendChild(head);
    return box;
  }
