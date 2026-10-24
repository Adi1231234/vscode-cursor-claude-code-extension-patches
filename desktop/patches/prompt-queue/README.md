# prompt-queue (desktop)

The VS Code panel's queue (`patches/prompt-queue`), run unchanged in the Code
tab of the Claude Desktop app: Alt+Enter and the add button only, sent one per
turn when Claude has really finished, with everything the panel has -
reorder, edit, skip, send now, duplicate, schedules (timer / after / at a time),
saved queues, the hold after a Stop (this panel's or the phone's), the
"continue" after a usage limit, per-conversation persistence and the log
(Ctrl+Alt+L). Every conversation's queue keeps running while another one is on
screen, as every editor tab's does.

## How it is the same queue

`renderer.json` tells `lib/build.cjs` to take the parent's own fragment list
(`patches/prompt-queue/order.json`) and stylesheet list
(`patches/prompt-queue/styles.json`) and swap a few named fragments:

- `queue/open.js` / `queue/close.js` (a `<script>` and an IIFE) become
  `host/open.js` / `host/close.js`: the same fragments as the body of a
  factory, `__ccdQueueEngine(host)`, so each call is a queue with its own
  state. `host/engines.js` follows it and makes one per conversation.
- `queue/env-vscode.js` becomes `host/env-engine.js` (which conversation this
  queue is: its store, its own session pushes, whether it is on screen),
  `host/env-desktop.js` (the composer, the footer, the attachment chips) and
  `host/env-send.js` (typing and submitting).
- `lib/js/ccDom.js` / `ccWatch.js` are dropped: the desktop bootstrap already
  loads them.

Plus two stylesheets of its own: `host/tokens.css` gives the queue's `--app-*`
/ `--vscode-*` tokens the Code tab's `--cds-*` values (on our nodes only), and
`host/preview.css` draws the image preview.

What the queue reads off the VS Code panel's store comes from
`desktop/lib/js/store.js`, one store per conversation of the same shape, fed
by the app's own event stream (`desktop/lib/js/ipc.js`): the CLI's frames
(stops and usage limits are read from the same `result` / `rate_limit_event`
frames as in VS Code) and the app's session record (`isRunning`).

## One queue per conversation

The app shows one conversation at a time. Each conversation gets its own
queue (`host/engines.js`); only the one on screen draws, and the one leaving
takes its panel and buttons down first (`queue/detach.js`, shared).

- **On screen** the queue types into the composer and presses Enter, as the
  person would.
- **Off screen** it has no composer: it sends when that conversation's run
  ends, through the app's own `LocalSessions.sendMessage`, and counts the
  conversation busy until the app reports the new run over, so never two
  items in one gap. An item with attachments waits until the conversation is
  on screen (they go through the composer).
- **The "New session" page** has a queue of its own (the draft). It becomes
  the new conversation's queue only when the page turns into one right after
  a send from it; opening another conversation from there leaves it behind.
- **Busy** is the app's own record of the run (`isRunning`), and on screen
  also the Stop button, which shows the moment a message is taken. Both hold
  it busy, so it falls only when the whole run is over.

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

## Tests

`desktop/tools/chrome-live/` runs the built payload in an isolated world of
claude.ai/code in a real Chrome, every write request answered locally, so
nothing reaches Claude; `fake-ipc.prelude.js` plays the app's main process.
`queue-add`, `queue-runs` (a stop from elsewhere, a usage limit, a normal
finish), `phone-link`, `background` (a conversation's queue sends while another
is on screen, one item per run, the phone steers it there, each queue draws
only its own), the `ui-*` screenshots, then `queue-send` (a real submit) last:
the stand-in send leaves the page showing Stop, so it goes on a fresh page.

## Not checked yet

Everything above ran in Chrome, not in the app itself: that comes after the
fingerprint step. What only the app can show: that `LocalSessions_$_onEvent`
carries every frame and the session record (`isRunning`), that
`sendMessage(sessionId, text)` with the rest left out sends like the
composer, that `getSession` answers with the record, and that a local
conversation's address is `/code/local_<uuid>`. The app also has its own
"resume after limit" (`LimitAutoResume`); with both armed, a limit could be
followed by two "continue"s.
