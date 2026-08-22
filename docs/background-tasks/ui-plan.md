# Background tasks: UI + patch plan

## The UI

**A strip above the composer** (same anchor `prompt-queue` uses:
`inp().closest('[class*="messageInputContainer_"]')`, inserted as a preceding
sibling). Hidden when there are no tasks, so it costs nothing in the common case.

One row per task, each row: a status dot (running / done / failed / stopped), the
task type glyph, the label, and a live right-hand detail.

- `local_bash` -> label is the command, detail is the last output line.
- `local_agent` -> label is `<subagent_type> · <description>`, detail is
  `last_tool_name` (or the rolling `summary` from `task_progress`), plus tokens and
  elapsed.
- `local_workflow` -> label is the workflow name, detail is `workflow_progress`.

Row actions: **open log** (whole row is the click target), **stop**
(`stopTask(task_id)`), and for a foreground task **send to background**
(`backgroundTasks(tool_use_id)`).

**Click -> a log dialog.** Reuse the app's own modal look (`[class*="modalBackdrop"]`
/ `modalContent` / `modalHeader` exist as CSS-module classes) so it does not read as
bolted on. Content per task type:

- Bash: a `<pre>` tailing the `.output` file, auto-scrolled while pinned to the
  bottom, with a "follow" toggle that turns off when the user scrolls up.
- Subagent: a rendered feed - each entry is a tool call (name + one-line input) with
  its result collapsed, and prose/thinking rendered as text when available. Built
  from `agent-<id>.jsonl` (richest) and/or from `session.messages` filtered by
  `sdkParentToolUseId === task.toolUseId`.
- Header: description, agent type, model, tokens, tool count, elapsed, status;
  footer: Stop, Copy, and "Open in editor".

## Hazards specific to this repo

- **RTL.** The `rtl` patch sets `direction:rtl` on the whole panel. Keep the log
  `<pre>` explicitly `direction:ltr; text-align:left` (the existing `rtl.css` rule
  for `pre,code` already covers it - do not add a competing selector), and avoid
  `position:absolute` + `inset-inline-end` on a full-width container.
- **Zero added height in the message list.** If any part of this ever renders inside
  the message list, it must not add height - see the scroll-pinning rule in
  `CLAUDE.md`. The composer strip is outside the list, which is one more reason to
  put it there.
- **Template-literal escapes.** Everything injected into the webview lands inside a
  `` ` `` literal in `extension.js`: no backticks, no `${`, and no `\n`/`\t` escapes
  anywhere (use `String.fromCharCode(10)`). Verify the *evaluated* form, not just
  `node --check`.
- **Never wrap `acquireVsCodeApi`** - use `getSession().connection.value` (see
  [README.md](README.md)).

## Suggested split into patches

Each is independently shippable and useful on its own.

1. **`subagent-text-stream`** - add `forwardSubagentText:!0` to the SDK options
   literal in `extension.js` (anchor: `agentProgressSummaries:void 0`). One value,
   in its own `.js` resource per the no-JS-in-PowerShell rule. Immediately makes
   subagent prose available in the stream; useful even before any UI exists.
2. **`task-registry`** - widen `handleTaskStarted`'s `task_type!=="local_agent"`
   guard in `webview/index.js` so every task type lands in `subagentTasks`, and stop
   wiping the map on `result` for tasks that are still running. This is the only
   edit to the webview bundle's own logic; anchor on the shape
   (`if(t.task_type!=="local_agent")return`) with the minified names captured.
3. **`task-strip`** - the composer strip + dialog shell, driven purely by
   `subagentTasks.subscribe(...)` and `messages.subscribe(...)`. No host changes:
   subagent logs already work from `session.messages`. Ships a usable feature.
4. **`task-log-bridge`** - the host-side watcher (`fs.watch` on the resolved
   `tasks/` and `subagents/` dirs) plus the `ccbg` message pair, so Bash logs and
   between-turn async-agent progress work too. Shared dir resolver goes in
   `lib/js/ccSessionDirs.js`.
5. **`task-actions`** - wire Stop / send-to-background to the existing
   `stopTask` / `backgroundTasks` control requests.

Order matters only in that 3 depends on 2, and 5 depends on the bridge from 4.

## Open questions to settle during implementation

- **Between-turn status.** `task_notification` for an async agent that finishes
  while no turn is running is queued and only delivered on the next turn, so the
  strip can show a finished agent as "running" for a while. The file watcher's
  last-write time is a decent hint; the honest fix is to let the host derive status
  from the `.output` tail / file eviction. Decide before shipping 4.
- **Log volume.** Cap the tail the host sends (e.g. last 256 KB, and only for the
  task whose dialog is open) - the `.output` files have a disk cap of their own but
  can still be large.
- **Does `require` work in the webview renderer?** Recorded as true for Cursor in
  memory `cursor-webview-gotchas`, never re-measured, and irrelevant to the chosen
  design - but if someone measures it, record the result there rather than acting
  on it.

## How to verify

Follow the "Testing a change" recipe in `CLAUDE.md` (pristine VSIX in a throwaway
`--extensions-dir` / `--user-data-dir`). Beyond the standard checks, the feature
needs a live exercise: in the throwaway editor start a long backgrounded Bash and a
`run_in_background` subagent, confirm both appear in the strip, open each dialog and
watch it grow, then Stop one and confirm the row settles. Also confirm the strip is
absent when nothing is running, and that the panel still renders under `rtl`.
