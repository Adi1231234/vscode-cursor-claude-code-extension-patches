# Background tasks + subagents: a live UI (design note)

**Status:** research done, not implemented. Measured against extension `2.1.240` /
CLI `2.1.228` (win32-x64) on 2026-08-23.

**Goal:** show in the panel which tasks are running in the background (backgrounded
Bash, subagents, workflows), let the user click one, and watch its log stream live
in a dialog.

## The headline finding

Almost everything needed is **already built and simply not wired to a UI**:

- The CLI already broadcasts a complete, live task feed on the SDK stream:
  `background_tasks_changed` (a full snapshot of everything running in the
  background), `task_started`, `task_progress`, `task_updated`, `task_notification`.
  The webview handles three of the five, and throws away every task whose
  `task_type` is not `local_agent`.
- The webview store already keeps a live `subagentTasks` signal fed from those
  events. **Nothing reads it** - 18 references, all writes.
- Every subagent's `tool_use` / `tool_result` is *already streamed* into
  `session.messages` tagged with `sdkParentToolUseId`, then deliberately hidden by
  the renderer's `subagentSpans` filter.
- `extension.js` already exposes `stopTask(taskId)` and `backgroundTasks(toolUseId)`.
  **Neither is ever called.**
- `store.openFile(path)` already exists, so "open this task's log as an editor tab"
  costs nothing.
- The CLI's own TUI already has this screen (a "Background" dialog grouping
  `local_bash` / `local_agent` / `local_workflow` / `remote_agent` / `monitor_*` /
  `mcp_task` / `dream`). The webview is the only surface missing it.

So this is mostly a *plumbing + rendering* patch, not a reverse-engineering one.

## Architecture

### One read-only hook gets almost all of it

The host posts every SDK message to the webview as
`{type:"from-extension", message:{type:"io_message", channelId, message:<sdk msg>}}`.
An injected `window.addEventListener("message", ...)` therefore observes the
**entire** stream - including the four task subtypes the app ignores - with no
prototype patching, no edit to the bundle's own logic, and no contact with
`acquireVsCodeApi`. That single listener drives the task list, the status feed, and
the subagent log.

This is live between turns. `launchClaude()` opens one iterator for the whole
session, and the CLI flushes task events through an enqueue listener the moment they
are produced; backgrounded subagents write to an always-on SDK writer. (An earlier
draft claimed the stream went dark between turns - that was wrong, see
[data-sources.md](data-sources.md) §1.)

### The one thing the stream does not carry

Background **Bash** output. `bash_progress` is dropped from the SDK stream unless
`CLAUDE_CODE_REMOTE` / `CLAUDE_CODE_CONTAINER_ID` is set, so its only source is
`%TEMP%/claude/<slug>/<sid>/tasks/<taskId>.output`, which the CLI appends live.

**The webview cannot read that file.** Proven, not assumed: both editors load
extension webview content in
`<iframe sandbox="allow-same-origin allow-pointer-lock allow-scripts allow-downloads">`
(`resources/app/out/vs/workbench/contrib/webview/browser/pre/index.html`, identical
in VS Code and Cursor), and a sandboxed iframe gets no node integration. The memory
note `cursor-webview-gotchas` claims `require` exists in the renderer; that claim is
wrong and has been corrected.

So background Bash logs need a small **extension-host** watcher: node `fs.watch` on
the resolved `tasks/` dir (VS Code's `createFileSystemWatcher` cannot see `%TEMP%`),
tailing by byte offset the way the CLI itself does.

### The bridge (no `acquireVsCodeApi` wrapping)

`webview/index.js` holds the vscode api on the connection object:
`class R0e extends NX { api; send(e){ this.api.postMessage(e) } }`, reachable as
`getSession().connection.value` (the existing `getSession()` fiber walk in
`prompt-queue/queue/session.js` finds the same store object).

- **webview -> host:** `connection.value.send({type:"__ccbg", …})`. The host patch
  intercepts it in the existing `e.webview.onDidReceiveMessage(...)` callback,
  *before* `comms.fromClient(a)`, so it never reaches the protocol switch.
- **host -> webview:** `webview.postMessage({type:"__ccbg", …})`. The app's listener
  only reacts to `type === "from-extension"`, so a distinct top-level type is
  invisible to it.

Both directions are purely additive. (A generic `exec` RPC also exists and would let
the webview read files without any host patch, but it buffers until process exit, so
it can only be polled - rejected.)

### Reactivity

`subagentTasks` / `messages` are Preact signals (`nt(x)` -> `new sc(x)`) and
`sc.prototype.subscribe(cb)` is intact and returns a disposer. Everything else is
event-driven: the message listener on the webview side, `fs.watch` on the host side.
Nothing in this design polls.

## How to verify

Follow the "Testing a change" recipe in `CLAUDE.md` (pristine VSIX in a throwaway
`--extensions-dir` / `--user-data-dir`). Beyond the standard checks, exercise it
live: start a long backgrounded Bash and a `run_in_background` subagent, confirm both
appear in the list, switch between them and watch each log pane grow, let the turn
end and confirm they keep updating, then Stop one and confirm its row settles. Also
confirm the footer indicator is absent when nothing runs, that its animation respects
`prefers-reduced-motion`, and that the two panes land on the correct sides under both
`rtl` and LTR.

## Files

- [data-sources.md](data-sources.md) - the measured stream events, what already
  reaches the webview, and the two unset init flags.
- [files-and-host-api.md](files-and-host-api.md) - on-disk log paths, caps,
  lifetimes, and the host RPCs already reachable from the webview.
- [ui-plan.md](ui-plan.md) - the proposed UI and how it splits into patches.
