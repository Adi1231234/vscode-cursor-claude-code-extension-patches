
  /* ---------- SDK stream observer ----------
     The host posts every SDK message as
       {type:"from-extension", message:{type:"io_message", channelId, message:<sdk>}}
     so a plain listener sees the whole stream, including the four task subtypes the
     app itself ignores. Read-only: nothing here touches the app's own handling. */

  function onSystem(m) {
    if (m.subtype === "task_started") {
      if (!m.task_id) return;
      var t = task(m.task_id);
      t.type = m.task_type || t.type;
      t.description = m.description || t.description;
      t.subagentType = m.subagent_type || t.subagentType;
      t.workflowName = m.workflow_name || t.workflowName;
      t.seenLive = true;
      if (m.tool_use_id) {
        t.toolUseId = m.tool_use_id;
        BY_TOOL[m.tool_use_id] = t.id;
        var held = PENDING[m.tool_use_id];
        if (held) { for (var i = 0; i < held.length; i++) pushLog(t, held[i]); delete PENDING[m.tool_use_id]; }
      }
      return changed();
    }
    if (m.subtype === "task_progress") {
      if (!TASKS[m.task_id]) return;
      var p = TASKS[m.task_id];
      if (m.description) p.description = m.description;
      if (m.subagent_type) p.subagentType = m.subagent_type;
      if (m.last_tool_name) p.lastTool = m.last_tool_name;
      if (m.summary) p.summary = m.summary;
      if (m.usage) { p.tokens = m.usage.total_tokens || p.tokens; p.toolUses = m.usage.tool_uses || p.toolUses; }
      if (m.workflow_progress) p.workflowProgress = m.workflow_progress;
      return changed();
    }
    if (m.subtype === "task_updated") {
      var u = TASKS[m.task_id];
      if (!u || !m.patch) return;
      if (m.patch.description) u.description = m.patch.description;
      if (m.patch.is_backgrounded !== undefined) u.backgrounded = m.patch.is_backgrounded === true;
      if (m.patch.status && m.patch.status !== "running" && m.patch.status !== "pending") finish(u, m.patch.status);
      return changed();
    }
    if (m.subtype === "task_notification") {
      var n = TASKS[m.task_id];
      if (!n) return;
      if (m.summary) n.summary = m.summary;
      if (m.output_file) noteLogPath(n, m.output_file, n.type === "local_agent" ? "agent" : "text");
      finish(n, m.status);
      return changed();
    }
    if (m.subtype === "background_tasks_changed" && Array.isArray(m.tasks)) {
      /* Only ever additive: this list holds backgrounded tasks only, so a running
         foreground subagent is legitimately absent from it. */
      for (var j = 0; j < m.tasks.length; j++) {
        var e = m.tasks[j];
        if (!e || !e.task_id) continue;
        var b = task(e.task_id);
        b.type = e.task_type || b.type;
        b.description = b.description || e.description || "";
        b.backgrounded = true;
        b.seenLive = true;
      }
      return changed();
    }
  }

  function blockEntry(c) {
    if (!c || !c.type) return null;
    if (c.type === "tool_use") return { k: "tool", id: c.id, name: c.name, input: c.input };
    if (c.type === "tool_result") return { k: "result", forId: c.tool_use_id, text: resultText(c), err: c.is_error === true };
    if (c.type === "text" && c.text) return { k: "text", text: c.text };
    if (c.type === "thinking" && c.thinking) return { k: "thinking", text: c.thinking };
    return null;
  }

  function resultText(c) {
    var v = c.content;
    if (typeof v === "string") return v;
    if (!Array.isArray(v)) return "";
    var out = [];
    for (var i = 0; i < v.length; i++) if (v[i] && v[i].type === "text") out.push(v[i].text);
    return out.join(NL);
  }

  function onAgentMessage(m) {
    var parent = m.parent_tool_use_id;
    var content = m.message && m.message.content;
    if (!parent || !Array.isArray(content)) return;
    if (m.type === "user") scanForBackgroundShells(content);
    var id = BY_TOOL[parent];
    var t = id ? TASKS[id] : null;
    for (var i = 0; i < content.length; i++) {
      var entry = blockEntry(content[i]);
      if (!entry) continue;
      if (t) { pushLog(t, entry); continue; }
      /* Held until the matching task_started names this tool_use id. A nested
         subagent's parent id never arrives, so the buffer is bounded. */
      var held = PENDING[parent] = PENDING[parent] || [];
      held.push(entry);
      if (held.length > MAX_LOG) held.splice(0, held.length - MAX_LOG);
    }
    if (t) changed();
  }

  function onUserMessage(m) {
    var content = m.message && m.message.content;
    if (Array.isArray(content)) scanForBackgroundShells(content);
  }

  function onSdk(m) {
    if (!m || typeof m !== "object") return;
    if (typeof m.session_id === "string" && m.session_id) SID = m.session_id;
    if (m.type === "system") return onSystem(m);
    if (m.parent_tool_use_id && (m.type === "assistant" || m.type === "user")) return onAgentMessage(m);
    if (m.type === "user") return onUserMessage(m);
  }
