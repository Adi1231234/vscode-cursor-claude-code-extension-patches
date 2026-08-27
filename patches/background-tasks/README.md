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
- **One thing polls, and it has to.** The stream listener and the signal
  subscription are push, and `fs.watch` catches a log file being created - but it
  does **not** report the appends. On Windows `fs.watch` is `ReadDirectoryChangesW`,
  and a file's size and last-write time only reach the directory entry when the
  writing handle is closed, which for a running task is when the task ends. Measured
  directly: a process appending once a second for eight seconds with its handle held
  grew the file every second (14 -> 70 bytes) while a directory watcher *and* a file
  watcher each fired exactly once, at 8.4 s, on close. In the panel that was a log
  frozen at "line 9" for twenty seconds and then jumping straight to the finished
  output. So `host/tail.js` keeps a 500 ms timer while a log pane is open on a task -
  one `statSync` a tick, no timer at all when nothing is open, and the read returns
  immediately when the size has not moved. Verified after the fix: the pane tracked
  the file byte for byte (56, 79, 103, 119, 143, 167, 191, 215, 231, 239 bytes).
- **The other timers.** A 1 s clock so elapsed times do not freeze, and the render
  coalescer is a `setTimeout` rather than `requestAnimationFrame` because a hidden
  panel never gets a frame.

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

## The look

**Depth comes from surfaces, not shadows** - shadows barely read on a dark theme.
Each layer is a translucent tint of the *theme's own foreground* over the theme's own
background (`color-mix`), which means the elevation is still correct on a light
theme, where a white overlay would do nothing. The modal itself does carry a shadow,
in two layers: a tight contact shadow and a wide ambient one.

**Radii nest** (shell 8, card 6, chip 4), borders are semi-transparent so edges stay
crisp over whatever is behind them, and hover / active / focus each raise contrast
rather than merely tinting.

**The composer button is a prompt sign inside the spinner.** It has one job to
say: things are running here, and how many. So the glyph is `>_` - the same mark
the shell rows carry inside their frame, which ties the button to the list it
opens - and the ring is the running state and nothing else. While tasks run the
ring fades in, spins in the accent, and the mark scales to .68 so it sits clear
inside it; when the last one finishes the ring goes and the mark returns to full
size at half opacity. A spinner that is always drawn and merely stops rotating
reads as a load that got stuck, not as a history you can open. Both groups are
transformed in `transform-box: view-box` coordinates - an SVG child otherwise
rotates and scales about its own tight bbox instead of the icon's centre. Sized
18px to match the queue button beside it: the app's own footer glyphs measure 26,
but that is the row above, and this cluster is [runs][queue][send].

**One glyph per row.** The task type is the icon and its status is a badge on the
icon's corner. Two separate columns of dots and icons made every row read as noise.

**The signature is the live hairline.** A background task is work happening while
you are not watching, so the one piece of motion in the dialog is an indeterminate
sweep under a running task's name - the workbench's own vocabulary for "still going".
The accent colour is spent only on that and on the running badge; even a pressed
toolbar toggle stays neutral, so nothing competes with it. Every animation is
transform/opacity, under 200 ms, and off under `prefers-reduced-motion`.

**Accessibility.** `role="dialog"` with `aria-modal`, a focus trap and focus restored
on close; the list is a `listbox` of `option`s driven by up/down/Home/End with Enter
to open; toggles report `aria-pressed`; every icon button carries an `aria-label` and
the app's own tooltip rather than a native `title`; status is never colour alone (a
failed task says so in words). Scroll containers set `overscroll-behavior: contain`
and are styled off the same variables Monaco uses for its own sliders, so they do not
fall back to the platform's bright slab with stepper arrows.

**Every render write is conditional.** The indicator and the dialog are redrawn
from a `MutationObserver` on `document.body` watching `childList` (React
re-renders the composer footer, so a timer would either lag or spin). Assigning
`textContent` replaces the node's children *whatever the value*, and that
replacement is itself a childList mutation - so an unconditional write wakes the
observer that scheduled the pass, which schedules the pass again, and the two
feed each other for as long as the indicator is on screen. It costs nothing
visible, which is why it hid: no layout, no paint, no network, just a renderer
pinned at 55% of a core (measured in the lab, 0% -> 55% -> 0% as the guard is
removed and put back). Writes go through `setText` in `config-dom.js`, which
compares before it writes; `className` is guarded the same way inline. Any new
per-pass write must do the same.

**RTL.** Layout is logical-property only, so the panes mirror under the `rtl` patch.
Latin phrases and tool-call rows are pinned so bidi cannot reorder them, and code
blocks stay LTR.

## Layout

- `tasks.css` (tokens + indicator + shared primitives), `shell.css`, `rows.css`,
  `log.css`, `feed.css` - all `__bg*` scoped, each with its own guard. The
  scrollbars come from `lib/css/ccScroll.css` now, shared with the queue and the
  responders dialog: the copy that lived here was inert, because something above
  every element in this webview sets `scrollbar-color` and Chromium then ignores
  every `::-webkit-scrollbar` rule. The shared file releases it first.
  The design tokens live on `.__bgRoot`, which both the dialog and the composer
  indicator carry
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
