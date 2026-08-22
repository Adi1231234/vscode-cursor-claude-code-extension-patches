# Background tasks: measured data sources

Read out of `extension.js` / `webview/index.js` (2.1.240) and the CLI binary
(2.1.228); the file paths and the `.output` behaviour were confirmed live on
Windows by backgrounding a real Bash command.

## 1. The stream is session-long and task events are pushed, not polled

Two facts that together decide the architecture:

- `store.launchClaude()` is guarded by `if(this.claudeChannelId)return` and is
  called once per session (from session load, not from `send()`). It opens **one**
  message iterator that `readMessages()` consumes for the whole session; the
  `finally` that clears `claudeChannelId` runs only when the session's stream ends.
- In the CLI's stream-json entry point the task-event queue gets an enqueue
  listener: `$Ze(() => { for (let ev of drain()) U.enqueue(ev) })`. Every task event
  is flushed into the SDK output the moment it is produced, with no turn required.

Background subagent messages have their own always-on path: in stream-json mode the
CLI sets an "active writer" (`o0n(v)` where `v` is the SDK transport) for the whole
process, and a backgrounded subagent's messages are written straight to it
(`nn.write(...)`, error text `bg-subagent progress write failed`).

So task events and subagent activity **do** reach the webview between turns.
(An earlier draft of this note claimed the opposite. It was wrong.)

## 2. Stream events (CLI -> extension host -> webview, verbatim pass-through)

`extension.js` has zero references to these subtypes; it is a pipe.

```
{ subtype:"task_started",    task_id, tool_use_id, task_type, subagent_type,
                             description, prompt, workflow_name,
                             owned_by_subagent, skip_transcript }
{ subtype:"task_progress",   task_id, tool_use_id, description, subagent_type,
                             last_tool_name, summary, workflow_progress,
                             usage:{ total_tokens, tool_uses, duration_ms } }
{ subtype:"task_updated",    task_id, patch:{ status?, description?, end_time?,
                             total_paused_ms?, error?, is_backgrounded? } }
{ subtype:"background_tasks_changed", tasks:[{ task_id, task_type, description }] }
{ subtype:"task_notification", task_id, tool_use_id, status, output_file,
                             summary, usage, skip_transcript }
```

`background_tasks_changed` is a **full snapshot of everything running in the
background**, emitted whenever that set changes; its filter is
`status is running|pending AND isBackgrounded !== false AND not an observer agent`.
`task_updated` is the status feed. **The webview handles neither** - it only reads
`task_started` / `task_progress` / `task_notification`, and `handleTaskStarted`
returns early unless `task_type === "local_agent"`.

`task_progress` is emitted per subagent tool call (not on a timer), so it is
genuinely live. Its `summary` field only arrives when `agentProgressSummaries` is
on - see §5.

`task_type` and the first character of `task_id` correspond one to one:
`local_bash b`, `local_agent a`, `remote_agent r`, `in_process_teammate t`,
`local_workflow w`, `monitor_mcp m`, `monitor_ws s`, `mcp_task k`, `dream d`,
`auto_mode_scan e`. For `local_agent`, `task_id === agentId`.

Finished tasks are evicted from the CLI's registry ~30 s after they end
(`evictAfter = now + 30000`), so a UI that wants history must keep its own, built
from `task_notification`.

## 3. Subagent messages already in `session.messages`

The CLI emits, per subagent step:

```
{ type:"assistant"|"user", message:<the subagent's own message>,
  parent_tool_use_id:<the Agent/Task/Skill tool_use id>,
  subagent_type, task_description, session_id, uuid, timestamp }
```

The webview maps `parent_tool_use_id` -> `Hp.sdkParentToolUseId` and stores it like
any other message; the renderer then hides it (`NRt()` builds `subagentSpans` from
`tool_use` blocks named `Agent` / `Task` / `Skill` / `skill__*`, `ARt()` drops
anything carrying an `sdkParentToolUseId` inside a span).

**Prose is gated.** In the agent tool: `if (!forwardSubagentText && type !==
"tool_use" && type !== "tool_result") continue;`. So today a subagent's tool calls
and results stream; its text and thinking do not.

## 4. Reading the stream without editing the bundle's logic

The host posts everything as `webview.postMessage({type:"from-extension",
message:e})`, and SDK traffic is wrapped as
`{type:"io_message", channelId, message:<sdk message>, done}`.

So an injected `window.addEventListener("message", ...)` sees the **entire** SDK
stream - every subtype above, including the ones the app ignores - purely as an
observer. No prototype patching, no bundle-logic edit, no `acquireVsCodeApi`.

## 5. Two init flags the extension leaves unset

The SDK `query()` options literal in `extension.js` contains
`includePartialMessages:!ke.env.remoteName, agentProgressSummaries:void 0,
promptSuggestions:void 0` and never mentions `forwardSubagentText`. Both are
threaded into the `initialize` control request.

- `forwardSubagentText:!0` -> subagent text and thinking stream too. Display-only:
  it feeds the SDK progress sink, not the parent's context or the transcript. It
  also stops `pwu()` from forcing the subagent's thinking display to `"omitted"`.
- `agentProgressSummaries:!0` -> `oht()` becomes true, which turns on the rolling
  natural-language `summary` in `task_progress` (and subagent summarization).

## 6. On-disk logs

Every task gets `outputFile` from `hC()`:
`%TEMP%/claude/<cwd-slug>/<sessionId>/tasks/<taskId>.output`. Confirmed live for a
backgrounded Bash, appended line by line.

- **Bash:** plain text. This is the only source - `bash_progress` /
  `powershell_progress` are dropped from the SDK stream unless `CLAUDE_CODE_REMOTE`
  or `CLAUDE_CODE_CONTAINER_ID` is set, so background Bash output never streams
  locally.
- **Subagent:** `initTaskOutputAsSymlink` actually **hardlinks** (falling back to
  `copyFile`, then to an empty file) `<taskId>.output` onto the agent's transcript.
  Under the copy fallback it is a frozen snapshot, so read the real path instead:
  `~/.claude/projects/<slug>/<sessionId>/subagents/[workflows/<wf_runId>/]agent-<agentId>.jsonl`.
- **Workflow:** on completion the `.output` is overwritten with **JSON**
  (`{summary, agentCount, logs, result, workflowProgress}`). Live progress is better
  taken from `task_progress.workflow_progress`, an array of
  `{type:"workflow_agent"|"workflow_phase"|"workflow_log", index, state, tokens, toolCalls, …}`.

Caps and semantics to mirror: reads are capped at 8 MB (`getTaskOutput` prefixes
`[NKB of earlier output omitted]`), the disk cap is 5 GB, and the CLI tails by byte
offset (`getTaskOutputDelta(taskId, offset, cap)`). `evictTaskOutput` only flushes
and releases the in-memory buffer - `cleanupTaskOutput` (the `unlink`) has no caller
in the binary, so a finished task's log stays readable.

**Do not recompute the `<cwd-slug>`** - drive-letter casing differs between
`URI.fsPath` and git, and worktrees get their own slug (memory
`windows-drive-letter-case-breaks-worktree-resume`). Scan for the session uuid the
way `lib/js/ccWtResolve.js` already does: `%TEMP%/claude/*/<sid>/tasks` and
`~/.claude/projects/*/<sid>/subagents`.

## 7. Host capabilities already reachable from the webview

`processRequest` on the host is one switch over 100+ request types, driven by
`connection.sendRequest({type, …})` and answered as `{type:"response", requestId,
response}`. Unknown types are only logged (`default: logger.error`), never fatal.
Already useful, with no host patch:

- `store.openFile(path)` - opens the live `.output` as a real editor tab, with the
  editor's own file watching and unlimited scrollback.
- `store.openContent(text, fileName, editable)` - opens arbitrary text in a tab
  (this is what the `Agent` tool renderer uses for its prompt).
- `exec` -> `spawn(command, params, {cwd, shell:false})`, unrestricted. A last-resort
  escape hatch for reading a file from the webview; it buffers until exit, so it
  cannot stream and would require polling. Not used by this design.
- `stopTask(task_id)` and `backgroundTasks(tool_use_id)` on the SDK client - both
  defined in `extension.js`, neither ever called.

## 8. What the transcript records (for reconstructing finished tasks)

- Backgrounded Bash: tool_result text `Command running in background with ID: <id>.
  Output is being written to: <path>.` plus `toolUseResult.backgroundTaskId`.
- Async agent: `toolUseResult = {isAsync:true, status:"async_launched", agentId,
  description, resolvedModel, prompt}`.
- Completion: a synthetic user message containing `<task-notification>` with
  `<task-id>`, `<tool-use-id>`, `<output-file>`, `<status>`, `<summary>`.
