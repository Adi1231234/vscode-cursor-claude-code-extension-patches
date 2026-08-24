# Background tasks: on-disk logs and host capabilities

Companion to [data-sources.md](data-sources.md); same builds, same method.

## On-disk logs

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

## Host capabilities already reachable from the webview

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

## What the transcript records (for reconstructing finished tasks)

- Backgrounded Bash: tool_result text `Command running in background with ID: <id>.
  Output is being written to: <path>.` plus `toolUseResult.backgroundTaskId`.
- Async agent: `toolUseResult = {isAsync:true, status:"async_launched", agentId,
  description, resolvedModel, prompt}`.
- Completion: a synthetic user message containing `<task-notification>` with
  `<task-id>`, `<tool-use-id>`, `<output-file>`, `<status>`, `<summary>`.

## Verified anchors

All unique in 2.1.240 unless noted:

- `agentProgressSummaries:void 0,promptSuggestions:void 0` (extension.js)
- `type:"from-extension",message:e` (extension.js, the host->webview envelope)
- `case"exec":return this.execCommand(` (extension.js, marks the `processRequest`
  switch)
- `?.fromClient(` (extension.js, **3 sites** - two chat surfaces and the session
  list; match with a regex capturing the minified names, do not hardcode)
- `s.data.type==="from-extension"` (webview/index.js, the app's own listener)
- `if(t.task_type!=="local_agent")return` (webview/index.js) - only needed if a
  later patch decides to populate the app's own `subagentTasks` instead of keeping a
  private registry.
