
  /* ---------- Task registry ----------
     The CLI evicts a finished task from its own registry after ~30s, so this is
     the only place a finished row survives. Rows recovered from disk are merged in
     under the same ids. */

  var TASKS = Object.create(null);    /* id -> task */
  var ORDER = [];                     /* first-seen order, for stable sorting */
  var BY_TOOL = Object.create(null);  /* Agent tool_use id -> task id */
  var PENDING = Object.create(null);  /* log entries seen before their task_started */
  var SID = null;                     /* CLI session id, learned from the stream */
  var HINT_DIR = null;                /* a real tasks/ directory, learned from a log path */

  function newTask(id) {
    return {
      id: id, type: typeOfId(id), description: "", subagentType: "", workflowName: "",
      toolUseId: "", status: "running", backgrounded: false,
      startedAt: Date.now(), endedAt: 0,
      tokens: 0, toolUses: 0, lastTool: "", summary: "",
      logPath: "", logKind: "", log: [], logDropped: 0, seenLive: false, onDisk: false
    };
  }

  function task(id) {
    var t = TASKS[id];
    if (!t) { t = newTask(id); TASKS[id] = t; ORDER.push(id); }
    return t;
  }

  function isRunning(t) { return t.status === "running"; }

  function label(t) {
    if (t.type === "local_agent" && t.subagentType) {
      return t.description ? t.subagentType + " · " + t.description : t.subagentType;
    }
    if (t.type === "local_workflow" && t.workflowName) return t.workflowName;
    return t.description || t.id;
  }

  function detail(t) {
    if (!isRunning(t)) return t.summary ? oneLine(t.summary, 90) : statusWord(t);
    if (t.summary) return oneLine(t.summary, 90);
    if (t.lastTool) return oneLine(t.lastTool, 90);
    return "";
  }

  var TYPE_WORD = {
    local_bash: "command", local_agent: "subagent", remote_agent: "cloud agent",
    in_process_teammate: "teammate", local_workflow: "workflow",
    monitor_mcp: "monitor", monitor_ws: "monitor", mcp_task: "mcp task"
  };

  function typeWord(t) { return TYPE_WORD[t.type] || "task"; }

  function statusWord(t) {
    if (t.status === "running") return "running";
    if (t.status === "failed") return "failed";
    if (t.status === "stopped" || t.status === "killed") return "stopped";
    return "done";
  }

  function duration(t) {
    return ago((t.endedAt || Date.now()) - t.startedAt);
  }

  /* Running first (oldest at the top, so a long task never moves), then the
     finished ones newest-first directly under the separator. */
  function snapshot() {
    var run = [], done = [];
    for (var i = 0; i < ORDER.length; i++) {
      var t = TASKS[ORDER[i]];
      if (!t) continue;
      if (isRunning(t)) run.push(t); else done.push(t);
    }
    run.sort(function (a, b) { return a.startedAt - b.startedAt; });
    done.sort(function (a, b) { return (b.endedAt || b.startedAt) - (a.endedAt || a.startedAt); });
    return { running: run, finished: done };
  }

  function runningCount() {
    var n = 0;
    for (var i = 0; i < ORDER.length; i++) { var t = TASKS[ORDER[i]]; if (t && isRunning(t)) n++; }
    return n;
  }

  /* A finished row exists only while its log does: a live subagent keeps its
     in-memory log, everything else needs a file. */
  function hasLog(t) {
    if (isRunning(t)) return true;
    if (t.log.length > 0) return true;
    return !!t.logPath;
  }

  /* The host's directory listing is the authority on what is still on disk. A
     finished row with no in-memory log that the listing did not mention has lost
     its file (%TEMP% is cleaned eventually), so it loses its row too. */
  function pruneAgainst(listed) {
    for (var i = 0; i < ORDER.length; i++) {
      var t = TASKS[ORDER[i]];
      if (!t || isRunning(t) || t.log.length > 0) continue;
      if (!listed[t.id]) { t.logPath = ""; t.onDisk = false; }
    }
    prune();
  }

  function prune() {
    var kept = [];
    for (var i = 0; i < ORDER.length; i++) {
      var id = ORDER[i], t = TASKS[id];
      if (t && hasLog(t)) kept.push(id); else delete TASKS[id];
    }
    ORDER = kept;
  }

  function finish(t, status) {
    if (!isRunning(t)) return;
    t.status = status || "completed";
    t.endedAt = Date.now();
  }

  function noteLogPath(t, p, kind) {
    if (!p) return;
    t.logPath = p;
    t.logKind = kind || t.logKind || "text";
    if (!HINT_DIR && kind !== "agent") {
      var cut = Math.max(p.lastIndexOf("/"), p.lastIndexOf(BS));
      if (cut > 0) HINT_DIR = p.slice(0, cut);
    }
  }

  function pushLog(t, entry) {
    t.log.push(entry);
    if (t.log.length > MAX_LOG) {
      var drop = t.log.length - MAX_LOG;
      t.log.splice(0, drop);
      t.logDropped += drop;   /* the pane counts total pushes, not array indices */
    }
  }
