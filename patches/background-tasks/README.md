# Background tasks

**Type:** feature
**Touches:** `webview/index.css`, `extension.js` (host runtime + panel script)
**Guard markers:** `/* BGTASKS */` (CSS and panel script), `/* BGTASKSHOST */` (host runtime)

An animated indicator in the composer footer while anything is running in the
background, and a two-pane dialog behind it: the task list on one side, the selected
task's live log on the other.

## Why it is mostly plumbing

The CLI already broadcasts a complete task feed on the SDK stream and the panel
already receives it - nothing renders it. See `docs/background-tasks/` for the full
survey. In short:

- `background_tasks_changed` is a snapshot of everything running in the background,
  `task_started` / `task_progress` / `task_updated` / `task_notification` are the
  per-task feed, and the webview handles only three of the five (and drops every
  task whose `task_type` is not `local_agent`).
- Every subagent's `tool_use` / `tool_result` already streams in tagged with
  `parent_tool_use_id`; the renderer deliberately hides it.
- `stopTask` and `backgroundTasks` are already defined in `extension.js` and never
  called.

## How it is wired

- **Reading the stream:** the host posts every SDK message as
  `{type:"from-extension", message:{type:"io_message", …}}`, so an injected
  `window.addEventListener("message")` observes the whole stream read-only. No
  prototype patching and no edit to the webview bundle's own logic.
- **Reading logs:** the panel cannot touch the filesystem (its content runs in a
  sandboxed iframe in both editors), so `host/*.js` runs in the extension host and
  tails by byte offset with one `fs.watch` per directory. It answers a private
  `"__ccbg"` message hooked into each chat webview's `onDidReceiveMessage` ahead of
  the app's protocol switch, so the app never sees it.
- **Talking to the host:** `getSession().connection.value.send(...)`, the connection
  object the store already holds. Never by wrapping `window.acquireVsCodeApi`, which
  blanks the whole panel.
- **Nothing polls.** The stream listener, the signal subscription and `fs.watch` are
  all push. The one timer is a 1 s clock so elapsed times do not freeze, and the
  render coalescer is a `setTimeout` rather than `requestAnimationFrame` because a
  hidden panel never gets a frame.

## The dialog

**List-detail, and it adapts.** The panel is very often a narrow sidebar, so a fixed
side-by-side split would be unusable there. A ResizeObserver on the dialog itself -
not the viewport - stacks the two panes below 560px: the list is the whole dialog
until a task is picked, the detail takes over, and a back button (and Escape)
returns. Above that width they sit side by side with a draggable splitter.

**The list** is two labelled groups with counts, Running then Finished, rather than
one flat run of rows. A row carries three levels of weight - name, live detail,
duration - and the selected one takes an accent on its leading edge. A task that
finishes moves across live, keeping its selection and its log. A finished row exists
only while its log does: a subagent seen this session keeps its in-memory entries,
anything else needs the file the host reported, and a vanished file drops the row.

**The detail pane** has a header (name, live pulse, type / status / tokens / tool
calls, and the rolling summary while it runs), a view toolbar, the feed, and the task
actions.

- *Toolbar*: a filter that narrows the feed (or the text log, line by line) and
  reports `shown/total`; a wrap toggle; and a follow toggle. Follow is also released
  by scrolling up, and while a live task is scrolled away from its end a
  "Jump to latest" affordance appears.
- *Feed*: four sources behind one view - a subagent still in memory, an older
  subagent's transcript jsonl, a workflow's `workflow_progress` as a phase tree, and
  any other task's `.output` text. Entries carry a timestamp gutter; a tool call
  collapses to its name plus one line of argument and folds its result in when it
  arrives.
- *Actions*: **Run in background** (only while a task is still in the foreground),
  **Stop** (styled as destructive, and never the first button under the cursor),
  then **Copy** and **Open in editor** as icon buttons.

**Accessibility and theming.** `role="dialog"` with `aria-modal`, a focus trap and
focus restored on close; the list is a `listbox` of `option`s driven by
up/down/Home/End with Enter to open; every icon button carries an `aria-label` and
the app's own tooltip rather than a native `title`; status is never colour alone (a
failed task says so in words); `prefers-reduced-motion` stops every animation. All
colour comes from the app's `--app-*` tokens, so the dialog follows the editor
theme - including the scrollbars, which otherwise render as the platform's bright
slab with stepper arrows.

**RTL.** Layout is logical-property only, so the panes mirror under the `rtl` patch.
Latin phrases and tool-call rows are pinned so bidi cannot reorder them, and code
blocks stay LTR.

## Layout

- `tasks.css` / `log.css` / `scroll.css` - shell + list, detail pane, and the
  scrollbar treatment; all `__bg*` scoped, each with its own guard
- `tasks/*.js` - the panel script, concatenated in the explicit order in `patch.ps1`
  (`config-dom` opens the `<script>` and the IIFE, `init` closes both);
  `workflow.js` is the phase / agent tree, split out to keep `logpane.js` small
- `host/dirs.js` `host/tail.js` `host/handle.js` - the host runtime, in that order
- `host/hook.js` - the one-line guard spliced into the webview message listener

`lib/js/ccStore.js` (the shared store finder) is pulled in as `@ccStore` in the
script order; `prompt-queue` injects the same file and the guards make the second
copy a no-op.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`).
Idempotent and fail-safe: each of the three edits is guarded separately and a
missing anchor skips that edit instead of corrupting anything.
