# Background tasks: UI + patch plan

## The UI

### 1. An animated indicator in the composer footer

Not a strip above the composer: a single small control **in the composer footer
row**, the same row the `prompt-queue` add button already lives in
(`form.querySelector('[class*="sendButton"]').parentNode`, i.e. `inputFooterV2`).
Insert it immediately before `.__qAdd`, so the action cluster reads
`[running] [queue add] [send]`, and re-anchor it on the same tick `ensureAddButton`
uses, because React re-renders that footer.

It appears only while at least one task is running, and shows a running count with a
continuous animation (a pulsing dot plus a slow rotating ring - `prefers-reduced-
motion` falls back to a static dot). Its tooltip lists the running task names, using
the same styled-tooltip markup as the queue button, not a native `title`.

State comes straight from the stream: `background_tasks_changed.tasks`
(`{task_id, task_type, description}`) is the authoritative running set, enriched by
`task_started` / `task_progress` / `task_updated`, and cleared per task by
`task_notification`. Because the CLI evicts a finished task from its registry after
~30 s, the indicator's own store keeps finished tasks for the rest of the session so
the dialog can still show them.

### 2. Click -> a two-pane dialog

Reuse the app's own modal look (`[class*="modalBackdrop"]` / `modalContent` /
`modalHeader` are existing CSS-module classes) so it does not read as bolted on.

**Leading pane: the list.** One row per task, each with a type icon and a name, plus
a status dot and elapsed time. Selecting a row is the only interaction; the first
running task is selected on open.

- subagent (`local_agent`) -> agent icon; name `<subagent_type> · <description>`
- background command (`local_bash`) -> terminal icon; name is the command
- workflow (`local_workflow`) -> workflow icon; name is the workflow name
- everything else (`remote_agent`, `monitor_*`, `mcp_task`, ...) -> a generic icon
  and the description, so an unknown type still renders

**Trailing pane: that task's live log.** It follows the selection and keeps
streaming while the dialog is open, auto-scrolled while pinned to the bottom with a
follow toggle that releases when the user scrolls up.

- subagent -> a rendered feed from `session.messages` filtered by
  `sdkParentToolUseId === task.toolUseId`: each entry a tool call (name + one-line
  input) with its result collapsed, and prose/thinking as text once
  `forwardSubagentText` is on. No file access at all.
- background command -> a `<pre>` tailing the `.output` file over the host bridge.
- workflow -> the `workflow_progress` array as a phase/agent tree.

Header: description, agent type, model, tokens, tool count, elapsed, status.
Footer: **Stop** (`stopTask(task_id)`), **Copy**, and **Open in editor**
(`store.openFile(outputFile)` for a command, `store.openContent(...)` for a rendered
subagent log).

Panes use normal flow and logical properties, never `inset-inline-end` on a
full-width container, so under the `rtl` patch the list sits on the right and the
log on the left, and in LTR the mirror of that.

## Hazards specific to this repo

- **RTL.** The `rtl` patch sets `direction:rtl` on the whole panel. The existing
  `pre,code` rule in `rtl.css` already forces the log block LTR - do not add a
  competing selector. Avoid `position:absolute` + `inset-inline-end` on a full-width
  container.
- **Zero added height in the message list.** The indicator lives in the composer
  footer, outside the list, which is one more reason to put it there; anything that
  ever renders inside the list must cancel its own height (see `CLAUDE.md`).
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
2. **`task-indicator`** - the animated footer control + the two-pane dialog, driven
   entirely by an injected `window.addEventListener("message")` observer over the SDK
   stream plus `messages.subscribe(...)`. No host changes, no edit to the webview
   bundle's own logic. Covers subagents and workflows completely; a background
   command lists and selects, but its log pane offers only "Open in editor" until
   patch 3.
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
appear in the list, switch between them and watch each log pane grow, let the turn
end and confirm they keep updating, then Stop one and confirm its row settles. Also
confirm the footer indicator is absent when nothing runs, that its animation respects
`prefers-reduced-motion`, and that the two panes land on the correct sides under both
`rtl` and LTR.
