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

## 6. What survives, and what a panel reload destroys

**Within one panel session, history is free.** Every task event is accumulated by
the consumer, so a finished task simply changes state in its own store; the CLI
evicting it after ~30 s is irrelevant, its subagent messages are still in
`session.messages`, and its `.output` file is still on disk.

**A panel reload kills the running tasks.** The chat surfaces set
`clientInitImpliesFreshClient = true`, so a webview `init` closes every channel,
which calls `query.return()` and ends the CLI subprocess. Anything running in the
background dies with it. So "history across a reload" only ever means already-dead
tasks.

**What a reload does replay**, through the normal transcript load:

- `Agent` tool_use blocks (`description`, `subagent_type`, `prompt`) and their
  tool_results (`Async agent launched successfully … agentId: aXXXX`).
- Bash tool_results (`Command running in background with ID: <id>. Output is being
  written to: <path>`).

Enough to rebuild the list: name, icon, task id and log path.

**What a reload does not replay:**

- The final status. `<task-notification>` is persisted only as
  `{type:"attachment", attachment:{type:"queued_command", commandMode:"task-notification"}}`,
  and the extension's transcript mapping (`B5t`) accepts only `user` / `assistant` /
  `system`, so every attachment is dropped.
- The subagent's own steps. `B5t` also drops `isSidechain`, and those messages were
  never in the parent `.jsonl` to begin with - they live in
  `subagents/agent-<id>.jsonl`, which the extension never reads.

Both are recoverable from disk through the same host reader that serves Bash logs:
the agent jsonl for the transcript, the `.output` file for a command.

On-disk logs, host RPCs and what the transcript records live in
[files-and-host-api.md](files-and-host-api.md).
