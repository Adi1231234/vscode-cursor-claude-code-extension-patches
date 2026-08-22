# Background tasks: UI + patch plan

## The UI

**A strip above the composer** (same anchor `prompt-queue` uses:
`inp().closest('[class*="messageInputContainer_"]')`, inserted as a preceding
sibling). Hidden when nothing is running, so it costs nothing in the common case.

The row set comes straight from `background_tasks_changed.tasks`
(`{task_id, task_type, description}`), enriched from `task_started` /
`task_progress` / `task_updated`, and moved to a "finished" section by
`task_notification`. Because the CLI evicts finished tasks from its registry after
~30 s, the strip keeps its own history for the session.

One row per task: a status dot (running / done / failed / stopped), a type glyph,
the label, and a live right-hand detail.

- `local_bash` -> label is the command, detail is the last output line.
- `local_agent` -> label is `<subagent_type> · <description>`, detail is
  `last_tool_name` (or the rolling `summary`, if `agentProgressSummaries` is on),
  plus tokens and elapsed.
- `local_workflow` -> label is the workflow name, detail is the last
  `workflow_progress` entry (`phaseTitle: label`).

Row actions: **open log** (the whole row), **stop** (`stopTask(task_id)`), and for a
foreground task **send to background** (`backgroundTasks(tool_use_id)`).

**Click -> a log dialog.** Reuse the app's own modal look (`[class*="modalBackdrop"]`
/ `modalContent` / `modalHeader` already exist as CSS-module classes) so it does not
read as bolted on.

- Subagent: a rendered feed built from `session.messages` filtered by
  `sdkParentToolUseId === task.toolUseId` - each entry a tool call (name + one-line
  input) with its result collapsed, and prose/thinking as text once
  `forwardSubagentText` is on. No file access at all.
- Bash: a `<pre>` tailing the `.output` file over the host bridge, auto-scrolled
  while pinned to the bottom, with a follow toggle that releases when the user
  scrolls up.
- Workflow: the `workflow_progress` array as a phase/agent tree.
- Header: description, agent type, model, tokens, tool count, elapsed, status.
  Footer: Stop, Copy, and **Open in editor** -> `store.openFile(outputFile)` for a
  Bash task (free - no bridge, and the editor does its own live reloading), or
  `store.openContent(...)` for a rendered subagent log.

## Hazards specific to this repo

- **RTL.** The `rtl` patch sets `direction:rtl` on the whole panel. The existing
  `pre,code` rule in `rtl.css` already forces the log block LTR - do not add a
  competing selector. Avoid `position:absolute` + `inset-inline-end` on a full-width
  container.
- **Zero added height in the message list.** The composer strip sits outside the
  list, which is one more reason to put it there; anything that ever renders inside
  the list must cancel its own height (see `CLAUDE.md`).
- **Template-literal escapes.** Everything injected into the webview lands inside a
  `` ` `` literal in `extension.js`: no backticks, no `${`, and no `\n`/`\t` escapes
  (use `String.fromCharCode(10)`). Verify the *evaluated* form, not just
  `node --check`.
- **No load-time `localStorage`** in injected webview JS (memory
  `cursor-webview-gotchas`); attach the message listener at load, touch storage
  lazily.
- **Never wrap `acquireVsCodeApi`** - use `getSession().connection.value`.

## Suggested split into patches

Each is independently shippable and useful on its own.

1. **`subagent-stream-flags`** - add `forwardSubagentText:!0` and
   `agentProgressSummaries:!0` to the SDK options literal in `extension.js`.
   Anchor: `agentProgressSummaries:void 0,promptSuggestions:void 0` (unique). Two
   values, in their own `.js` resource per the no-JS-in-PowerShell rule. Useful
   before any UI exists: subagent prose starts streaming and `task_progress` starts
   carrying a live summary.
2. **`task-strip`** - the composer strip + dialog shell, driven entirely by an
   injected `window.addEventListener("message")` observer over the SDK stream plus
   `messages.subscribe(...)`. No host changes, no edit to the webview bundle's own
   logic. Covers subagents and workflows completely; a Bash row shows status but
   its dialog offers only "Open in editor".
3. **`task-log-bridge`** - the host-side `fs.watch` on the resolved `tasks/` dir and
   the `__ccbg` message pair, so a Bash task's log tails inside the dialog. Shared
   session-dir resolver goes in `lib/js/ccSessionDirs.js` beside `ccWtResolve.js`.
4. **`task-actions`** - wire Stop / send-to-background to the existing `stopTask` /
   `backgroundTasks` control requests (needs a host `case`, same site as 3).

Order matters only in that 3 and 4 build on 2's UI.

### Verified anchors

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

## Open questions to settle during implementation

- **Log volume.** Mirror the CLI's own caps: tail at most 8 MB, track a byte offset,
  and only stream the task whose dialog is open.
- **Hardlink fallback.** A subagent's `<taskId>.output` is normally a hardlink to its
  `agent-*.jsonl`, but falls back to a one-time `copyFile`. Always read the jsonl
  path; never trust `.output` for a subagent.
- **Cross-session tasks.** `background_tasks_changed` is per session. A task started
  in another panel/session will not appear. Decide whether that is acceptable
  (it matches the CLI's own scope) before promising a global view.

## How to verify

Follow the "Testing a change" recipe in `CLAUDE.md` (pristine VSIX in a throwaway
`--extensions-dir` / `--user-data-dir`). Beyond the standard checks, exercise it
live: start a long backgrounded Bash and a `run_in_background` subagent, confirm both
appear, open each dialog and watch it grow, let the turn end and confirm the rows
keep updating, then Stop one and confirm the row settles. Also confirm the strip is
absent when nothing runs, and that the panel still renders under `rtl`.
