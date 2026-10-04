# Phone queue

**Type:** feature
**Touches:** `extension.js`, plus a Claude Code mod copied beside it
**Guard markers:** `/* PHONEQUEUEHOST */` (host), `/* PHONEQUEUE */` (panel script)
**Needs:** Claude Code **2.1.287** or later (mods), in every editor on the machine

`/queue` in the Claude app, over Remote Control, sees and steers the panel's
prompt queue (`patches/prompt-queue`). Sent alone it opens a menu of buttons;
`/queue help` lists the typed shortcuts (`pause`, `play`, `add in 10m ...`,
`del 2`, ...), which also work from the panel's own composer.

## How a command travels

1. **The mod** (`mod/`, a Claude Code plugin with a hooks module) registers
   `/queue` and runs inside the CLI behind the panel. It has no way to the
   webview, so it POSTs the command to the host.
2. **The host** (`host/server.js`) listens on `127.0.0.1` at a random path. The
   CLI learns the address, and a token for **the panel that spawned it**, from
   its environment: `host/env.js` sits in `spawnClaude`, where `this` is that
   panel's comms object and `this.webview` the webview its messages come from.
   Both keys go in last and are always set, empty when there is nothing to
   give: a CLI inherits the environment of whatever started the editor, and an
   editor started from a CLI in a patched panel would otherwise answer every
   `/queue` from the parent window. `host/panels.js` keeps the token per
   webview, held weakly, and takes an answer only from the webview it asked; a
   closed panel is noticed because VS Code's `postMessage` resolves `false` on a
   disposed webview rather than throwing. `host/args.js` adds `--plugin-dir`.
3. **The panel** (`webview/link.js`) runs it through `window.__qRemote`
   (`prompt-queue/queue/remote-api.js`), which calls the same functions the
   panel's own buttons do, and answers with the queue as it now stands.

Routing is by who spawned the CLI, never by session id. In a new conversation
the panel learns its session id only **after** the first command has run, and
that command was waiting for the panel: a version that had panels claim their
session ids answered "no panel" to the first `/queue` of every new tab.

## Facts it is built on (measured on 2.1.287, from a real phone)

- **Mods are behind a rollout flag**, `tengu_plugin_hooks_modules`, read at CLI
  start from `cachedGrowthBookFeatures` in `~/.claude.json` - shared by every CLI
  version on the machine. Older CLIs (2.1.280, 2.1.227) wrote `false` there and
  the mod did not load until a 2.1.287 CLI had fetched `true`.
- **`immediate: true` does not run a phone command mid-turn** in the editor: the
  SDK-mode bridge queues it until the turn ends (the terminal's bridge does not).
  `session.receive` fires on arrival, so a command that changes the queue is
  applied there and its answer printed when `command.run` comes (`register.js`).
  A pause sent while Claude works therefore holds the next item.
- **The only dialog a mod may raise is `$.ui.ask`**: a question, 2-4 labels, a
  12-character chip, and a free-text field. `$.tool.call` refuses
  `AskUserQuestion` ("that is $.ui.ask (host check)"), so no option descriptions.
  On the phone the question keeps its line breaks and buttons are full rows.
- **The app's Skip answers the dialog with `[No preference]`** instead of closing
  it, and **its X with `[User dismissed — do not proceed, wait for next
  instruction]`** (both read off what claude.ai sends). The first menu took Skip
  for a typed message, queued it, and Play sent it to Claude; a later one let
  the X text through on the first screen because it is longer than the 40
  characters it allowed. `screens.js` treats any answer that is only a
  bracketed placeholder, of any length, or no answer, as closing the menu.
- **A command's output is plain text on the phone and markdown in the panel**
  (a `<p>` with `white-space: pre-wrap`). `mod/hooks/text.js` writes text that
  reads the same in both - no markup, no list-shaped lines, a no-break-space
  line between groups.
- While a menu is open the CLI is busy, so **the queue waits** until it is
  answered or closed - and `$.ui.ask` has no timeout of its own: measured, a
  menu left open held the queue for over 10 minutes, and would have for good.
  Returning from the command without an answer frees the CLI but leaves the
  dialog drawn over the composer, answering nothing. So after 5 minutes with
  no answer the mod asks the panel to withdraw it (`drop` in
  `webview/link.js`): the dialog request's own `reject(message, false)`, which
  is what its X does - no interrupt, so nothing is stopped and the queue is not
  parked - and the menu ends with a line saying why.
- **A command says what it means, and the answer names what it touched.** The
  queue can move while a menu screen is open or a typed number travels, so the
  menu sends a skip's direction and "up"/"top" rather than a place, and every
  answer names the item ("✅ Deleted: fix the bug"). A typed edit asks before
  replacing the text, a typed time is read whole or refused ("at 9:00 pm" is
  21:00, never 09:00 with the text "pm ..."), and a number typed on the first
  screen opens that item instead of queueing the message "2".
- **A changing command from the phone is applied on arrival** (`session.receive`)
  and answered when `command.run` comes, with what it did and the queue as it is
  *then* (`pending.js` keeps the result, not the text). Measured from claude.ai:
  `/queue add` and `/queue play` sent mid-turn, then Stop - both still reached
  `command.run` after the stop, and the play's answer read "Running" while the
  Stop had parked the queue, until the state was read at print time.
- **Every `/queue` is a run of its own** to the rest of the panel, and **the
  phone's Stop never passes the panel's `interrupt()`**. Both broke other patches
  and are fixed where they live, on `lib/js/ccReply.js`: the queue now parks on a
  stop from anywhere (`prompt-queue`), "Claude finished" stays quiet for a run
  with no reply (`panel-settings`), and a command's output is no longer a reply
  to answer (`auto-followup`).
- Below 2.1.287 the patch writes nothing and says why: there are no mods to run
  in, and 2.1.280's spawn code has no env assignment of this shape.

## Tests

    node patches/phone-queue/tests/run-all.mjs        # unit suites, no editor
    node patches/phone-queue/tests/e2e/run.mjs        # every button, in tools/lab

The e2e run drives the real dialog in a lab panel and checks the queue after
each case. It refuses a conversation with Remote Control on: once it ran in the
one being used from a phone and read, from there, as the menu looping.

**The phone's path without a phone:**

    node patches/phone-queue/tests/e2e/phone.mjs --port 9556 --chrome 9225

runs the same cases over Remote Control. It turns Remote Control on in the lab
tab, opens the session's claude.ai link in a background tab of a Chrome that is
logged in to claude.ai (`--chrome`: that Chrome's remote-debugging port), sends
and answers everything from that page (`tests/e2e/web.js`), and closes it and
turns Remote Control off at the end. The site reaches the CLI through the same
bridge as the app (`origin.kind === 'bridge'`), draws the same question card
(`.epitaxy-approval-card`: the options, Other, Skip, X) and sends the same
answers, so only the app's own drawing of the card is left untested. Use a
second lab (`lab.mjs up --port 9556`), never the one someone holds on a phone.
