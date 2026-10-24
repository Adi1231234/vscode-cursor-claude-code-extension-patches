# phone-queue (desktop)

`/queue` from the Claude app (Remote Control) steers the queue of a
conversation open in the desktop app's Code tab - the parent's
`patches/phone-queue`, with the same mod, unchanged.

## How a command travels

1. **The mod** (`patches/phone-queue/mod`) runs in the CLI and POSTs
   `{ panel, sid, cmd }` to the address in `CC_PHONE_QUEUE_URL`.
2. **The main process** listens there with the parent's own
   `host/listen.js`, and `main/router.js` hands the command to every Code tab
   page our preload runs in (each says "hello" on load).
3. **The page** (`renderer/link.js`) runs it through `window.__qRemote` if the
   CLI session belongs to the conversation on screen, and answers; otherwise it
   answers nothing, and when no page had it the phone is told to open the
   conversation in the app.

## Wiring without touching a spawn site

The editor adds `--plugin-dir` and the address where the panel spawns its CLI.
Here nothing in the app's code is anchored: `main/start.js` puts both into the
main process's environment at startup, and every local session inherits it.
`CLAUDE_CODE_PLUGIN_DIRS` is the documented way to load a plugin folder "where
no flag can be given (a session the desktop app or an SDK host starts)", read
from the process environment. `apply.ps1` copies the mod to
`%LOCALAPPDATA%\claude-code-patches\mods\queue`, outside the app folder.

## Routing by conversation

The app names a conversation `local_<uuid>`; the CLI behind it has its own
session id, which is what the mod sends. `desktop/lib/js/session.js` learns the
pair from the app's event stream: every frame carries `session_id`, every row
of a loaded transcript `sessionId`.

## Measured

- `node desktop/patches/phone-queue/tests/main.test.js`: the real listener,
  router and start-up wiring with Electron stood in for.
- A real `claude -p "/queue list"` started with the environment `start.js`
  sets loaded the mod from `CLAUDE_CODE_PLUGIN_DIRS`, its POST reached the
  stand-in page, and the phone's formatted answer came back
  (`queue: ⏸ Paused · 1 in order ...`).
- `tools/chrome-live/phone-link.check.js`: on claude.ai/code, a command for
  the CLI session behind the conversation on screen pauses, adds (the row
  appears in the panel) and deletes; one for another session is left alone.

## Limits

- Only the conversation on screen answers: the others' queues are saved but
  not running in the page.
- `drop` (withdraw a menu nobody answered) needs the dialog's own reject(),
  which is in the page's world, out of the preload's reach: the menu stays
  open, to be answered from the phone or in the app.
- Not yet run inside the real app (that comes after the fingerprint step).
