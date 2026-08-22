# Background tasks + subagents: a live UI (design note)

**Status:** research done, not implemented. Measured against extension `2.1.240` /
CLI `2.1.228` (win32-x64) on 2026-08-23.

**Goal:** show in the panel which tasks are running in the background (backgrounded
Bash, subagents, workflows), let the user click one, and watch its log stream live
in a dialog.

## The headline finding

Almost everything needed is **already built and simply not wired to a UI**:

- The webview store already keeps a live `subagentTasks` signal
  (`Map<taskId, {toolUseId, description, prompt, summary, recentTools, usage, startTime, status}>`),
  fed by `task_started` / `task_progress` / `task_notification` stream events.
  **Nothing in the webview reads it** - 18 references, all writes.
- Every subagent's `tool_use` / `tool_result` block is *already streamed* into
  `session.messages` tagged with `sdkParentToolUseId`, and then deliberately
  hidden by the renderer's `subagentSpans` filter.
- `extension.js` already exposes `stopTask(taskId)` and `backgroundTasks(toolUseId)`
  control requests. **Neither is ever called.**
- Every background task already writes a plain-text live log to one predictable
  directory (see [data-sources.md](data-sources.md)).
- The CLI's own TUI already has this screen (a "Background" dialog grouping
  `local_bash` / `local_agent` / `local_workflow` / `remote_agent` / `monitor_*` /
  `mcp_task` / `dream`). The webview is the only surface missing it.

So this is mostly a *plumbing + rendering* patch, not a reverse-engineering one.

## Architecture

Two sources, used for what each is actually good at:

| need | source | why |
| --- | --- | --- |
| which tasks exist, status, usage | webview stream events (`task_*`) | already parsed, zero cost |
| live log content | the task's `.output` file / `agent-*.jsonl`, watched from the **extension host** | survives between turns |

**The stream goes dark between turns.** `readMessages()` only runs while a query is
active, and the store wipes `subagentTasks` on `result`. An async agent launched
with `run_in_background` keeps running after the turn ends - its progress events
queue up and only arrive when the next turn starts. So the stream alone cannot
drive a live log; the file watcher can, and does so regardless of turn state.

**Do not read files from the webview.** The memory note
`cursor-webview-gotchas` records `require` existing in the Cursor renderer, but VS
Code webviews are sandboxed iframes without node integration, and patches here must
be editor-agnostic. Host-side `fs` + `fs.watch` is also the idiomatic VS Code
design. This has *not* been re-measured; if someone does measure it, it still
should not change the design.

### The bridge (no `acquireVsCodeApi` wrapping)

`webview/index.js` holds the vscode api on the connection object:

```js
class R0e extends NX { api; send(e){ this.api.postMessage(e) } }
```

reachable from injected JS as `getSession().connection.value` (the existing
`getSession()` fiber walk from `prompt-queue/queue/session.js` finds the same store
object that owns `subagentTasks`). So:

- **webview -> host:** `connection.send({ type:"ccbg", ... })`; host-side patch adds
  its own `webview.onDidReceiveMessage` handler *before* `comms.fromClient(a)`.
- **host -> webview:** `webview.postMessage({ type:"ccbg-log", ... })`. The app's own
  listener only reacts to `type === "from-extension"`, so a distinct top-level type
  is invisible to it; our injected `window.addEventListener("message", ...)` picks
  it up. Both directions are purely additive.

### Reactivity

`subagentTasks` / `messages` are Preact signals (`nt(x)` -> `new sc(x)`), and
`sc.prototype.subscribe(cb)` is intact and returns a disposer. Subscribe; never
poll. On the host side use node `fs.watch` on the task dir + on the open task's file
(VS Code's `createFileSystemWatcher` cannot see `%TEMP%` or `~/.claude`).

## Files

- [data-sources.md](data-sources.md) - the measured event shapes, file paths and
  what is / isn't forwarded.
- [ui-plan.md](ui-plan.md) - the proposed UI and how it splits into patches.
