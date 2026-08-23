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

## What the two panes show

The list is running tasks (oldest first, so nothing jumps), a separator, then
finished ones newest-first. A task that finishes moves across the separator live,
keeping its selection and its log. A finished row exists only while its log does: a
subagent seen this session keeps its in-memory entries, anything else needs the file
the host reported, and a vanished file drops the row.

The indicator is animated with a running count while anything runs, and stays as a
quiet static glyph afterwards. It has to: the dialog is the only way to reach the
finished list, so a button that disappeared with the last task would take the
history with it. It is absent entirely until the first task of the session.

The log pane has four sources behind one view: a live subagent's entries straight
off the stream, an older subagent's transcript jsonl, a workflow's `workflow_progress`
array as a phase / agent tree, and any other task's `.output` text. The jsonl and the
text are tailed by the host; the other two need no file at all.

Per-task actions in the pane footer, safest first: **Run in background** (only while
a task is still in the foreground - Ctrl+B semantics for that one task), **Stop**,
**Copy**, and **Open in editor**. The first two go through `backgroundTasks` and
`stopTask`, the control requests `extension.js` already defines and never called.

Pair with `subagent-stream-flags`: without it a subagent's prose and thinking are
never forwarded, so the feed shows tool calls only.

## Layout

- `tasks.css` / `log.css` - indicator + dialog styles and log-pane styles, all
  `__bg*` scoped, each with its own guard. Scroll containers are styled through
  the `--vscode-scrollbarSlider-*` variables Monaco uses, so they match the
  editor instead of showing the platform's own bar
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
