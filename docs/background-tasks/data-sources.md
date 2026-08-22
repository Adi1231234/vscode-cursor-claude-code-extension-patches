# Background tasks: measured data sources

Everything below was read out of `extension.js` / `webview/index.js` (2.1.240) and
the CLI binary (2.1.228), and the file paths were confirmed live on Windows.

## 1. Stream events (CLI -> extension host -> webview, verbatim pass-through)

`extension.js` does not touch these; they arrive in the webview's
`processIncomingMessage`.

```
{ type:"system", subtype:"task_started",
  task_id, tool_use_id, task_type, subagent_type, description, prompt,
  workflow_name, owned_by_subagent, skip_transcript }

{ type:"system", subtype:"task_progress",
  task_id, tool_use_id, description, subagent_type, last_tool_name, summary,
  workflow_progress, usage:{ total_tokens, tool_uses, duration_ms } }

{ type:"system", subtype:"task_notification",
  task_id, tool_use_id, status, output_file, summary, usage, skip_transcript }
```

`task_type` is one of `local_bash` · `local_agent` · `local_workflow` ·
`remote_agent` · `in_process_teammate` · `monitor_mcp` · `monitor_ws` · `mcp_task` ·
`dream` · `auto_mode_scan`.

**The webview throws most of them away:** `handleTaskStarted` returns early unless
`task_type === "local_agent"`. Widening that one condition is the whole of "see
background Bash in the UI".

For `local_agent`, **`task_id === agentId`** (`hC(agentId, "local_agent", ...)`).
For `local_bash`, `task_id` is the shell id (`b1mc2dn8d`-style).

## 2. Subagent messages already in `session.messages`

The CLI's SDK-stream generator emits, per subagent step:

```
{ type:"assistant"|"user", message:<the subagent's own message>,
  parent_tool_use_id:<the Agent/Task/Skill tool_use id>,
  subagent_type, task_description, session_id, uuid, timestamp }
```

The webview maps `parent_tool_use_id` -> `Hp.sdkParentToolUseId` and stores it in
`messages` like any other message. The renderer then hides it: `NRt()` builds
`subagentSpans` from `tool_use` blocks named `Agent` / `Task` / `Skill` /
`skill__*`, and `ARt()` drops anything with a `sdkParentToolUseId` inside a span.

**Caveat - prose is gated.** In the agent tool:

```js
let dr = l.options.forwardSubagentText;
...
if (!dr && Ot.type !== "tool_use" && Ot.type !== "tool_result") continue;
```

`forwardSubagentText` is an SDK `query()` option threaded into the `initialize`
control request. The extension's options literal sets
`includePartialMessages`, `agentProgressSummaries:void 0`, `promptSuggestions:void 0`
- and **never sets `forwardSubagentText`**, so it is `undefined`. Result today: a
subagent's tool calls and tool results stream live, its text and thinking do not.

Adding `forwardSubagentText:!0` beside `agentProgressSummaries:void 0` is a
one-value patch that turns on full live subagent prose. It only affects what is
forwarded to the SDK consumer (the `d(...)` progress sink) - not the parent's
context, not the transcript.

## 3. On-disk live logs (the always-available source)

### Uniform per-task text log

```
%TEMP%/claude/<cwd-slug>/<sessionId>/tasks/<taskId>.output
```

Built by `v4t(taskId)` = `join(xte(), sessionId, "tasks", taskId + ".output")`,
`xte()` = `join(tmpdir()+"/claude", slug(cwd))`. Confirmed live: a backgrounded
`Bash` produced `.../7973ea02-.../tasks/b1mc2dn8d.output`, appended line by line
while running. Every Bash gets one (foreground too, `isBackgrounded:!1`); async
agents get one as well - the Agent tool's async result carries
`outputFile: Sv(agentId)`, described as "Path to the output file for checking agent
progress".

### Structured subagent transcript

```
~/.claude/projects/<cwd-slug>/<sessionId>/subagents/agent-<agentId>.jsonl
~/.claude/projects/<cwd-slug>/<sessionId>/subagents/workflows/<wf_runId>/agent-<id>.jsonl
```

(`D0(agentId)`.) A full transcript: `isSidechain:true`, `agentId`,
`attributionAgent` (the agent type, e.g. `Explore`), normal `user`/`assistant`
entries with real `message.content`. This is the richest live log for a subagent -
including its thinking - and it is written whether or not `forwardSubagentText` is
on.

### Resolving the directories without guessing the slug

Do **not** re-implement `hv(cwd)`: the drive-letter casing differs between
`URI.fsPath` and git (see memory `windows-drive-letter-case-breaks-worktree-resume`),
and worktrees get their own slug. Instead scan one level for the session id, the way
`lib/js/ccWtResolve.js` already does for `<sid>.jsonl`:

- `%TEMP%/claude/*/<sessionId>/tasks`
- `~/.claude/projects/*/<sessionId>/subagents` (recursive for workflow subdirs)

Session ids are uuids, so the match is unambiguous. This is worth extracting into a
shared `lib/js/ccSessionDirs.js` alongside `ccWtResolve.js`.

## 4. Control requests already wired in `extension.js`

```js
async stopTask(id)            // {subtype:"stop_task", task_id}      "Stops a running task"
async backgroundTasks(tuId)   // {subtype:"background_tasks", tool_use_id}
```

Both defined, neither called anywhere. `stop_task` works for any task type;
`background_tasks` without a `tool_use_id` backgrounds all foreground tasks
(Ctrl+B semantics) - i.e. a "send to background" button is also free.

## 5. What the transcript records (for reconstructing finished tasks)

- Backgrounded Bash: tool_result text `Command running in background with ID: <id>.
  Output is being written to: <path>.` plus `toolUseResult.backgroundTaskId`.
- Async agent: `toolUseResult = {isAsync:true, status:"async_launched", agentId,
  description, resolvedModel, prompt}`.
- Completion: a synthetic user message containing
  `<task-notification><task-id>…</task-id><output-file>…</output-file><status>…</status><summary>…</summary></task-notification>`.

All three are parseable from `session.messages` with no extra plumbing, which is how
a task that finished earlier in the conversation can still be listed and re-opened.
