# prompt-queue (desktop)

The VS Code panel's queue (`patches/prompt-queue`), run unchanged in the Code
tab of the Claude Desktop app: Alt+Enter and the add button only, sent one per
turn when Claude has really finished, with everything the panel has -
reorder, edit, skip, send now, duplicate, schedules (timer / after / at a time),
saved queues, the hold after a Stop (this panel's or the phone's), the
"continue" after a usage limit, per-conversation persistence and the log
(Ctrl+Alt+L).

## How it is the same queue

`renderer.json` tells `lib/build.cjs` to take the parent's own fragment list
(`patches/prompt-queue/order.json`) and stylesheet list
(`patches/prompt-queue/styles.json`) and swap exactly three fragments:

- `queue/open.js` / `queue/close.js` (a `<script>` and an IIFE) become
  `host/open.js` / `host/close.js`: the same code inside `__ccd.patch`, which
  runs once the DOM exists.
- `queue/env-vscode.js` becomes `host/env-desktop.js`: everything the queue
  knows about the page it runs in - read and write the composer, submit it,
  where the panel, the buttons and the attachment chips are.
- `lib/js/ccDom.js` / `ccWatch.js` are dropped: the desktop bootstrap already
  loads them.

Plus two stylesheets of its own: `host/tokens.css` gives the queue's `--app-*`
/ `--vscode-*` tokens the Code tab's `--cds-*` values (on our nodes only), and
`host/preview.css` draws the image preview.

What the queue reads off the VS Code panel's store comes from
`desktop/lib/js/session.js`, a store of the same shape built from what the
preload's isolated world can see: the conversation from the address, busy from
the Stop button, and the CLI's own frames from the app's event stream
(`desktop/lib/js/ipc.js`), so a stop from the phone and a usage limit are read
from the same `result` / `rate_limit_event` frames as in VS Code.

## Measured on the live composer (claude.ai/code renders the same one)

- Two typed lines read `a\n\nb` through `innerText`; `composerText` joins
  paragraphs with one newline, or every round trip added a blank line.
- An Enter in the same task as the text is written sends the editor's old,
  empty state; one task later it sends. The app empties the composer before it
  shows Stop, so the send waits for both, or the next pass would send a second
  item into that gap. Text still in the composer after 3 s means not sent: the
  item stays in the queue and is retried.
- Files arrive as `blob:` URLs read in the page's world, so they are caught on
  their way in (paste, drop, file picker) instead of off FileReader.
- The "New session" page has no conversation id until its first message. The
  queue there starts empty (the one it left stays saved), and what is queued is
  adopted by the conversation it becomes (`queue/session-id.js`).

## Tests

`desktop/tools/chrome-live/` runs the built payload in an isolated world of
claude.ai/code in a real Chrome, every write request answered locally, so
nothing reaches Claude: `queue-add` (Alt+Enter, button, panel, colours),
`queue-send` (a real submit, two lines), `ui-*` (screenshots of the panel and
every dialog) and `queue-runs` (a stop from elsewhere, a usage limit, a normal
finish, through the event stream via `fake-ipc.prelude.js`).

## Not checked yet

Everything above ran in Chrome, not in the app itself: the run in the real
desktop app comes after the fingerprint step. Two things only the app can show:
that `LocalSessions_$_onEvent` carries every frame of a local session, and that
the address of a local session is `/code/local_<uuid>` (or `/epitaxy/...`).
The desktop app also has its own "resume after limit" (`LimitAutoResume`);
with both armed, a limit could be followed by two "continue"s.
