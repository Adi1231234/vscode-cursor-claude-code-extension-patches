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

**Leading pane: the list, in two groups.** Running tasks on top, then a separator,
then finished ones below it. One row per task, each with a type icon and a name,
plus a status dot and a duration. Selecting a row is the only interaction; the first
running task is selected on open, or the newest finished one if nothing runs.

- subagent (`local_agent`) -> agent icon; name `<subagent_type> · <description>`
- background command (`local_bash`) -> terminal icon; name is the command
- workflow (`local_workflow`) -> workflow icon; name is the workflow name
- everything else (`remote_agent`, `monitor_*`, `mcp_task`, ...) -> a generic icon
  and the description, so an unknown type still renders

Ordering is chosen so rows do not jump: running sorted by start time ascending, so a
long-running task keeps its place and a new one appears at the bottom of the group;
finished sorted by end time descending, so the most recently finished sits directly
under the separator. **When a running task finishes it moves live across the
separator** to the top of the finished group, keeping its icon, name and log; if it
is the selected row the selection follows it and the log pane does not reset, it
just stops growing.

The finished group is populated from two places. Within the panel session it is free
- the store already holds every task it saw. Older tasks of the same conversation
come from disk through the host reader: it enumerates the session's
`subagents/**/agent-*.jsonl` and `tasks/*.output`, and the webview joins those ids
with names taken from the replayed transcript (`Agent` tool_use inputs, Bash
commands). A reload kills the CLI process and every task that was running, so
nothing in the running group ever needs to survive one. See
[data-sources.md](data-sources.md) §6.

**A finished row exists only while its log does.** A subagent seen this session is
always listed, because its messages are still in `session.messages`; everything else
is listed only if the host's directory listing actually found its file. `%TEMP%` is
cleaned by the OS eventually, so a task whose `.output` is gone is dropped from the
list rather than shown as an empty row. If a file disappears while the dialog is
open the watcher reports the unlink and the row goes with it.

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

- **RTL.** Keep log blocks `direction: ltr` and give short labels
  `unicode-bidi: plaintext`. Never `position:absolute` + `inset-inline-end` on a
  full-width container.
- **Zero added height in the message list.** The indicator lives in the composer
  footer, outside the list - one more reason to put it there.
- **Template-literal escapes.** Everything injected into the webview lands inside a
  `` ` `` literal in `extension.js`: no backticks, no `${`, and no `\n`/`\t` escapes
  (use `String.fromCharCode(10)`). Verify the *evaluated* form, not just
  `node --check`.
- **No load-time `localStorage`** in injected webview JS (memory
  `cursor-webview-gotchas`); attach the message listener at load, touch storage
  lazily.
- **Never wrap `acquireVsCodeApi`** - use `getSession().connection.value`.

## What shipped

Two patch folders, both applied and verified against a throwaway 2.1.240 install:

1. **`subagent-stream-flags`** - `forwardSubagentText:!0` and
   `agentProgressSummaries:!0` in the SDK options literal in `extension.js`.
   Anchored on `agentProgressSummaries:void 0,promptSuggestions:void 0`. Useful on
   its own: subagent prose starts streaming and `task_progress` starts carrying a
   live summary.
2. **`background-tasks`** - everything else in one feature folder: the CSS, the
   panel script (`tasks/*.js`), the extension-host log reader (`host/*.js`) and the
   `__ccbg` hook spliced into each chat webview's message listener. The plan
   originally split this into three; they collapsed into one because the log reader,
   the history listing and the Stop action all live at the same host site and share
   the same message channel.

The shared store finder moved to `lib/js/ccStore.js` with a `Get-CcStoreHelper`
in `lib/Patch.ps1`; `prompt-queue/queue/session.js` now delegates to it instead of
carrying its own copy of the fiber walk.

Two things the first pass missed and an audit added: the workflow pane (a
`local_workflow` has no message log, only `workflow_progress`) and the
send-to-background action, whose host op existed with nothing calling it. The audit
also made the host's directory listing authoritative - a finished row it does not
mention has lost its file and loses its row - rather than waiting for the user to
click it and get a `gone`.

Deviations from the plan worth knowing:

- **The dialog adapts instead of always splitting.** The plan assumed side-by-side.
  The panel is very often a narrow sidebar, where that is unusable, so a
  ResizeObserver on the dialog stacks the panes below 560px - list, then detail with
  a back button. This is the standard small-screen form of list-detail and it was
  the single biggest usability problem in the first cut.
- **The pane got a view toolbar.** Filter (with a `shown/total` count), wrap, and a
  follow toggle that a scroll can also release, plus a "Jump to latest" affordance
  while a live task is scrolled away from its end.
- The render coalescer is a `setTimeout`, not `requestAnimationFrame`: a hidden
  panel never gets a frame, so rAF would stall the whole UI while the user is
  looking at another view.
- The dialog does not force a direction. It follows the document's, and labels carry
  `unicode-bidi: plaintext` so a Hebrew description and a Latin path each read the
  right way round.
- Elapsed times need a 1 s clock; that is the only timer in the feature.

The verified anchor list lives in
[files-and-host-api.md](files-and-host-api.md).

## Open questions to settle during implementation

- **Log volume.** Mirror the CLI's own caps: tail at most 8 MB, track a byte offset,
  and only stream the task whose dialog is open.
- **Hardlink fallback.** A subagent's `<taskId>.output` is normally a hardlink to its
  `agent-*.jsonl`, but falls back to a one-time `copyFile`. Always read the jsonl
  path; never trust `.output` for a subagent.
- **Cross-session tasks.** `background_tasks_changed` is per session, so a task
  started in another panel does not appear. That matches the CLI's own scope and is
  left as is.
- **Status of an older async agent.** For a task recovered from disk the final
  status is often unknowable: `<task-notification>` is not replayed, and an async
  agent's tool_result only says `async_launched`. Show such rows as "finished"
  without a success or failure mark rather than guessing; a sync agent's tool_result
  and a command's exit-code line in its `.output` do carry the outcome.
