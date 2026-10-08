# Prompt Queue

**Type:** feature
**Touches:** `extension.js + webview/index.css`
**Guard marker:** `/* QUEUE */`

Codex-style queue: hold messages while Claude is busy, edit / reorder / skip, sent one per turn. `queue.css` + `saved/saved.css` -> stylesheet, ordered `queue/*.js` and `saved/*.js` fragments (each < 150 lines) concatenated and injected after the INPUTRTL/ZOOM script (uses the webview nonce + image-preview class hash).

## Adding to the queue

The queue is **opt-in only**. Plain Enter and the app's send button are left
completely untouched - they send immediately, as normal (no busy-time
interception). The only things that enqueue are the explicit gestures:

- `Alt+Enter`, or
- the small ghost **add-to-queue button** (`__qAdd`, `add-button.js`)
  injected just left of the app's send button, with a styled tooltip
  (mirrors the app's mic-button tooltip) showing the `Alt+Enter` shortcut.

**Idle-hold:** an explicit add while idle sets `paused` so the queue does *not*
auto-drain - you build a batch, then release it with the panel's play button.
Without this the flush loop would send the item immediately, making an idle
queue impossible. Adding while busy leaves the queue draining normally after
the turn.

The add button is re-anchored on every pass (`ensureAddButton`) because the app
re-renders its own footer; `insertBefore` on the existing node just moves it,
so it never duplicates.

## What runs the queue (`drive.js`)

One **pass** does everything the queue needs from the outside world: pick up a
conversation switch, keep the stop hook and the footer buttons in place, bring
the panel back if React dropped it, arm `after` items, and send the next item
when Claude is idle. It used to run on a 150 ms `setInterval`, in every panel,
whether anything had changed or not. Everything it reads can only change on a
push, so it now runs on those and nothing else:

- `busy`, the session id and the conversation itself, through
  `lib/js/ccSession.js` (signal subscriptions that follow a conversation switch);
- the app re-rendering the composer, through the shared observer
  (`lib/js/ccWatch.js`) scoped to the composer's container - the panel and the
  buttons are marked `data-cc`, so the queue's own re-render is not one;
- the queue itself changing (`render()` schedules a pass);
- a scheduled item coming due: one one-shot timer for the earliest `at`, re-armed
  by every pass.

Passes are coalesced into one `setTimeout(0)` (not `requestAnimationFrame`: a
hidden panel gets no frames, and the queue has to keep sending behind another
view). Measured in the lab: an item queued while busy was sent **1-7 ms** after
`busy` fell, and scheduled items within 10-25 ms of their time. See "The webview
runtime" in `../../CLAUDE.md`.

Three rules keep a pass from asking for itself:

- **`render()` is "the queue changed", `paint()` is only the DOM.** The pass puts
  back a panel React dropped with `paint()`; going through `render()` asked for
  another pass, and with no composer to paint into yet (a reload with a saved
  queue) that repeated every few ms until the composer appeared.
- **A failed send backs off** (1 s doubling to 30 s) instead of being retried by
  the pass its own `render()` schedules.
- **The due timer never looks more than a minute ahead.** `setTimeout` overflows
  past ~24.8 days and fires at once, forever; and its clock may stop while the
  machine sleeps, where `at` is wall-clock time. A visible countdown also pushes
  when it reaches zero.

`__qAuto.busy()` is true while the queue is sending as well as while a turn runs,
so auto-followup never answers a reply in the gap between the queue taking an
item and the app marking the turn busy.

## Stopping Claude parks the queue (`stop-pause.js`)

Pressing **stop** while a turn is running sets `paused`, so the queue holds
instead of firing the next item the moment the turn ends. Stopping means "not
this, and not whatever came after it" - draining straight into the next prompt
is the opposite of what the gesture asked for. The panel header shows
`paused - N queued` with the play button, and the state is persisted like any
other pause; one click releases it.

The hook is on the **session's own `interrupt()`**, decorated per session
(`hookStopPause`, re-run on every pass because the object is replaced when the
active conversation changes; guarded by `__qStopHook` so it decorates once,
and isolated in its own try/catch - it decorates someone else's object, and a
throw there would otherwise take the rest of the pass down with it, on that
pass and every one after).
That is the single funnel every stop path goes through - the composer's stop
button (`onClick` -> `session.interrupt()`), a plain Escape (the app's
body-level handler), and `restartClaude`. It runs **synchronously with the
gesture**, i.e. before `busy` flips false and before the pass that flip
schedules. Watching for the same gestures in the DOM instead would mean
re-implementing the app's own conditions *and* would still race the flush; and
`busy` going false is not a signal on its own - it is identical for a normal
turn end.

Two guards keep it to real stops: `interrupt()` also runs for a plain Escape
while **idle** (the app's handler is not gated on busy), which is not a stop -
so `isBusy()` must hold; and an empty queue has nothing to park, so `paused` is
never set behind the user's back when the queue isn't in use.

**A stop from outside the panel parks it too** (`watchStopsElsewhere`). Stop
pressed in the Claude app over Remote Control goes straight to the CLI and never
runs this panel's `interrupt()`, so the hook above cannot see it. Measured
2026-10-04 with the connection's own `interruptClaude()` (the call both stops end
in): the turn ended and the queue sent its next item at once - stopping from the
phone did not stop. Every stop does leave a `[Request interrupted by user]` row
in the store before `busy` falls (`lib/js/ccReply.js`), so the run's start is
marked and a stop found since then parks the queue the same way. A tool refused
with no reason given leaves the same row (the app sends that refusal with
`interrupt` set, and the turn ends there), so it parks the queue as well; a
refusal with a reason does not end the turn and does not park. The busy callback
is a microtask and the flushing pass a timer, so the park lands first. Three
details keep it from parking when nobody stopped anything: the mark is the set
of rows there were, by uuid or by the row itself when it has none, not a
position (the store trims its list past 600 rows, and a position then points
into the run's own rows); the first value after a switch
of conversation is no edge, so a mark from the old conversation is never read
against the new one; and Play pressed while the stopped run winds down re-marks,
so only a stop after the Play can park again.

Note this is the same `paused` as the play/pause button, and it now holds
**everything**, scheduled messages included (see `firstSendableIndex`). A due
scheduled item used to fire straight through it, on the grounds that a
commitment to a wall-clock moment should outlive a pause; that made this very
gesture - Stop - not stop, and a hold that silently lets some items through is
the one thing a hold must not be.

Decorating an instance method is safe here (an own property over the prototype,
`orig.apply(this, arguments)` returns the original promise untouched) - it is
not the `acquireVsCodeApi` wrap the root CLAUDE.md forbids.

## A usage limit parks the queue (`usage-limit.js`)

A turn refused by a usage limit ends like any other turn: `busy` falls and the
queue sent its next item, which was refused at once - and so on until the queue
was empty, every item spent on *"You've hit your weekly limit · resets ..."*.
Now the queue parks instead, exactly like a Stop, and the header says why: a
**usage limit** badge (in `--app-warning-accent`, beside the paused label) whose
tooltip names the limit and its reset time in the app's own words.

What tells it is the CLI's own `rate_limit_event` frame. The CLI sends one
whenever the account's limit state changes (and when the windows' usage moves),
a 429 included, before the turn's `result`. The store uses it for its banner
and meter but keeps none of it where a patch can read it, and the row a refused
turn leaves in the transcript is only `<synthetic>` text, so matching that text
is the one thing not to do. The queue reads the frame on its way in, by
decorating the store's own `processIncomingMessage` (`decorateSession` in
`session.js`, the same once-per-store decoration the Stop hook uses).

- **Refused** is `status: "rejected"`, unless usage credits cover it
  (`overageStatus` `allowed` / `allowed_warning`) - the app's own reading.
- **The state is the latest frame**, not a sticky flag: an `allowed` frame
  clears it, and so does the reset time passing (no frame says that). The CLI
  sends `allowed` after a refusal the moment a request goes through again.
- **Parked on the run's end**, like a stop from elsewhere: the busy callback is
  a microtask and the flushing pass a timer. An empty queue is never parked.
- **Play overrides it**, as with any pause: the next item is sent anyway, and
  if the limit still holds, that turn's end parks the queue again. The badge
  goes away by itself at the reset time.

Measured in the lab on 2.1.292 by feeding a `rejected` frame (the shape of a
real transcript row's `quotaLimits`) right before a real turn's `result`: the
turn's item ran, the two behind it stayed, the queue parked, Play sent one and
parked again, an `allowed` frame took the badge away. Fed mid-turn instead, the
CLI's next real frame (`allowed`, the five-hour usage having moved) cleared it
before the turn ended, and nothing parked - which is right.

## Persistence (`persist.js`)

The queue survives a full editor restart, per session:

- **Storage:** `localStorage`, key `ccq:<sessionId>`. The app itself persists
  prefs in localStorage, which proves it is durable in this webview.
- **Session key (`getSessionId`), in priority order:**
  1. The webview URL query param `?session=<uuid>` - **the reliable source**:
     available immediately (no waiting for React), stable across reloads.
  2. Fallback: the reachable session object's `.sessionId` (`getSession()`).
  3. Last resort: a fiber walk for an `activeSessionId` / `sessionId` prop -
     which in practice is NOT on the composer's ancestor chain, so it rarely
     hits. (An earlier version relied only on this and silently never
     persisted; the URL param is what fixed it. Note ids may be a signal
     `{value}` not a string - `sidFromVal` unwraps both.)
  `syncSession` (run on every pass) swaps `Q` when the active id changes.
- **Saved on every change:** `render()` calls `saveQueue()`; inline text edits
  call `scheduleSave()` (debounced). Emptying the queue removes the key.
  Serialized shape is compact (`{p:paused, c:collapsed, items:[{t,o?,f?:[{n,d}]}]}`);
  `File` objects are dropped at rest and rebuilt from their data URL on send.
  Save is quota-guarded: on overflow it retries text-only so prompts survive.
- **Also persisted:** the panel's **collapsed/minimized** state (`c`), restored
  per session by `loadQueue`.
- **Restore is always parked:** a restored non-empty queue forces `paused`, so
  reopening the editor never auto-fires messages - the user releases with play.

If the session id can't be read, persistence silently disables (the queue
still works in memory) rather than risking a wrong-keyed write.

## Saved queues (`saved/`)

A queue you built once, kept for the next chat: the bookmark beside the send
button (and the one in the panel header) opens a dialog that saves the current
queue under a name and loads, renames, edits or deletes the saved ones. Stored
globally rather than per session (`ccq:saved`), because every Claude panel in a
window shares one webview origin and therefore one localStorage - which is what
makes "pick it up in the next conversation" work at all. Text, skipped state
and *relative* schedules are kept; at-times and attachments deliberately are
not, and a load parks the queue like any other bulk add. Read `saved/README.md`
before touching it.

All three dialogs here - schedule, log viewer, saved queues - share
`queue/modal-shell.js` (behaviour: overlay, an icon + title + subtitle head, a
foot, Esc, backdrop, focus trap, one-modal-at-a-time, and a hook letting a
caller claim a key so Escape can step back a level) and `queue/modal.css` (the
look: the app's own confirm-dialog family - `--app-modal-background` scrim,
`--app-spacing-*` / `--corner-radius-*`, a 1px border and no shadow, a surface
washed from the top with `--app-transparent-inner-border`, and an accent-tinted
medallion in the head). Change either and all three dialogs change together,
which is the point.

## Debug log viewer (`log.js`)

A tiny in-webview logger: `ccLog(tag, ...)` buffers to an in-memory ring (2000);
`persist.js` logs session resolution / save / load. **`Ctrl+Alt+L`** opens a
modal listing the logs plus an environment probe (which globals exist,
`localStorage`, the resolved session id, ...). The button itself is hidden by
default - `window.__ccLogBtn()` shows it, `window.__ccLogs()` returns the array.
Everything is in-memory + on-demand; it never touches `localStorage` at load and
never wraps `acquireVsCodeApi` (both break the webview - see the root CLAUDE.md).
This is how the persistence bug above was finally diagnosed inside the real webview.

## Reordering a row (`buildNav` in `render-panel.js`)

Four controls in one column at the leading edge: **to top**, **up**, **down**,
**to bottom**. All four are always rendered and merely `disabled` at the ends -
the to-top button used to be omitted on the first row, which made that one row
shorter than the rest. The fourth button costs ~9px of row height; the glyphs
are drawn at 10px with tighter padding so it is not more.

All four go through `moveItemTo(it, p)` with a clamped **lane** position - the
queue is never spliced a second way, and the number they move against is the
one printed on the row (see Scheduling below: a floating scheduled item eats
no slot).

## Row actions menu (`row-menu.js`)

A row carries a lot of controls, so the ones a row only needs now and then
live in one kebab (three dots) beside the reorder arrows at the leading edge.
It opens a small popup:

- **Send now** - jump the queue order, the schedule, the paused hold **and a
  running turn** (`sendNow`). Sending while Claude works is the app's own
  case, not something to wait out: `session.send` has no busy gate (none in
  2.1.227, 2.1.258 or 2.1.280), it hands the message to the CLI mid-turn, and
  from 2.1.278 it also shows it in the transcript as held (`heldPrompts`)
  until the CLI picks it up - exactly what the composer's own Enter does
  then. "One per turn" is the *queue's* pacing, for items it sends on its own;
  it used to block this explicit gesture too, with "Claude is busy right now".

  When it cannot run - the item is skipped, or another send of ours is in
  flight - **the reason takes the label’s place** in amber and the item goes
  inactive, rather than hiding in a tooltip. `sendBlocked(it)` is re-run **on
  the click, not only while the menu is built**, since either can change
  while the menu sits open. On a refusal the menu stays open so the reason
  can be read. The reasons are kept short and `.__qMenu` has a `min-width`
  that fits the longest of them, so the swap moves nothing.
- **Schedule…** - opens the schedule modal. Offered **only while the item has
  no schedule** (`!isScheduled(it)`, which also covers a missed or rearm
  item: both keep their `mode`). Once a schedule is set the clock cell is
  drawn in the row instead, so a schedule is always visible and one click
  away, and the menu stops offering a second way to it.
- **Duplicate** - `duplicateItem` clones the item *with everything around it*
  (schedule `mode`/`at`/`start`/`dur`, the `missed`/`rearm` restart flags, the
  skipped state, attachments) and inserts it directly below the original. An
  at-time copy keeps the same wall-clock moment; a timer copy keeps the same
  remaining countdown, so the copy reads identically to its source.
**Delete is not in the menu**: it is a trash button at the row's trailing end
(`removeItem`), in the slot an unscheduled row's clock used to take. A set
clock sits just before it, so the end of every row is the same control. It is
an `iconBtn` shrunk to the clock's quiet 18px glyph; `queue.css` explains the
doubled class.

Two things the popup has to get right:

- It is **body-mounted and `position:fixed`** - the queue body scrolls
  (`overflow-y:auto`) and would clip an in-flow menu. `placeMenu` anchors it
  under the button and flips it up / pulls it in at the viewport edges.
- Because it lives outside the panel, `render()` calls `closeRowMenu()` -
  a rebuild would otherwise orphan it. It also closes on outside mousedown,
  `Escape`, scroll (capture, so the queue body counts) and resize.

Menu actions are **identity-based** (`Q.indexOf(it)`), not index-based: an
item above can flush between opening the menu and clicking an entry.

## Scheduling (`schedule-*.js`)

The schedule modal (row menu -> **Schedule…**, or the row's clock once one is
set) offers four choices. The thing to
understand first is **which of them keep their place in the queue**, because
that is what the list is printing.

### The lane, and the ones committed to a clock (`schedule-order.js`)

An item **gates** when the queue must not go past it. An item **floats** when
it is committed to a wall-clock moment and to nothing else. That single
property decides everything: a gating item is in the lane, carries a position
number, and holds everything below it; a floating item has no position at all,
is drawn in its own group, and the lane renumbers without it.

- **Queue** (default) - in the lane, sent in FIFO order.
- **Timer** - a delay from now. **Holds by default**: "wait 10 minutes" is
  about pacing the queue.
- **After** - a timer that only starts once the item reaches the front (the
  message before it has finished). Always gates - a countdown measured from
  "the one before me finished" only means anything in order. Shown as
  "Waiting · Nm" until armed, then a live ring (advanced once a second by
  `tickRings()` on the shared clock, `lib/js/ccClock.js`, only while a ring is
  showing and the panel is visible). Moving it back resets it
  (`armAfterItems`), and it re-arms when it is at the front again.
- **At time** - an exact `datetime-local` plus quick presets, must be in the
  future. **Does not hold by default**: an hour is a moment in the world, and
  freezing four messages behind it for eighteen hours is almost never what was
  meant.

Either absolute mode can be switched with the dialog's one toggle, **"Hold the
queue until this sends"** (`schedule-hold.js`, the app's own switch reproduced
from its measurements). Turning it on for an at-time is the case that had no
expression before: *run the migration at 02:00, then these three follow-ups.*

### A timer set into a paused queue (`schedule-paused.js`)

The pause holds scheduled items too, and the queue is often paused without
anyone having asked for it - an `Alt+Enter` while idle parks it, and so does
Stop. In practice that meant a timer set in that state counted down to zero
and sent nothing, with nothing having said it would. Two places now say so:

- **The dialog, when the choice is made.** While the queue is paused, a
  schedule (anything but "Queue") shows *"The queue is paused, so this will
  not send at its time until you resume it"*, the primary button becomes
  **Schedule and resume**, and a **Keep paused** button commits without lifting
  the hold. A running queue keeps the dialog it had.
- **The queue, for as long as it is true.** A pause can also arrive after the
  timer was set, so while the queue is paused and a countdown is still running,
  the header shows **TIMER RUNNING** (or *N TIMERS RUNNING*) and the row's
  countdown reads `29:41 · queue paused`, both in `--app-warning-accent`. The
  wording names the queue, not the timer: an earlier "timer on hold" next to a
  live countdown read as if the timer itself had stopped. At zero the header
  badge goes (the once-a-second tick empties it, `:empty` hides it, no
  re-render) and the row says `due · queue paused`.

The pause itself still means what it means; nothing here sends through it.

### Why this exists

A scheduled item used to do both at once: it kept its position number **and**
let the row below overtake it. `firstSendableIndex` scanned the whole queue for
anything due before it ever looked at the front, then skipped every pending
schedule on the way down - so a 10-minute timer on item 1 sent item 2 first,
and a timer that came due at position 5 jumped over a plain item at position 1.
The numbers promised an order the queue did not run, in both directions. There
is no way to draw that honestly: the fix is that an item either keeps its
number and holds the lane, or gives up its number.

### Send logic (`firstSendableIndex` in `model.js`)

Two scans, in the order the panel draws them: the scheduled group first (a due
floating item fires from wherever it sits, a pending one blocks nothing), then
the lane strictly from the front (the first gate holds everything behind it
until it is armed and due; the first plain item sends).

**`paused` stops both**, scheduled items included. It used to let a due one
fire through, which meant Stop - which pauses (`stop-pause.js`) - did not stop.
The cost is real and deliberate: nothing sends while you are away. Combined
with the restore rule below, a schedule only ever fires in a window you left
running and un-paused.

Parked items (skipped / missed / rearm) are never gates - a skipped gate would
be a deadlock with nothing on screen to explain it - but they keep their place
in the lane, so un-skipping puts them back where they were.

### What the dialog says before it commits

Beside the live natural-language summary (`fmtSummary`), a note states the cost
of the choice: how many messages would wait behind a hold, and - the case with
no other way of being seen - that a chosen hour **cannot be kept** because
something above already holds the lane past it ("An item above holds the queue
until 11:37 PM, so this sends then, not at 8:37 PM"). Both come from
`gateAbove` / `heldBelow`.

### Restart policy

We are a client-side scheduler (like classic Outlook's Outbox, not Gmail's
server side): a schedule only fires while the editor is open. The full schedule
(`at`, `start`, `mode`, `dur`, `hold`) is in localStorage, so on reopen
(`persist.js` `loadQueue`) each item is restored by type - a decision made
deliberately for an AI agent, where auto-running a prompt you weren't watching
is the real risk:

- **At-time still in the future** -> stays active, keeps ticking, fires at its
  time (if the editor is open and the queue is not paused then).
- **At-time whose moment passed while closed** -> flagged `missed` (amber, held,
  "Missed · H:MM"); never auto-sent. Click to reschedule.
- **Timer** (a relative countdown - its origin is lost across a restart) ->
  `rearm`: inactive, shown as "Restart Nm"; one click re-runs the duration from
  now (`rearmTimer`), keeping its hold, because a restart is not a decision.

This is the Quartz "discard / do-nothing" misfire stance plus a visible state,
chosen over "fire-once" / "fire-all" catch-up because our messages execute.
A restore also forces `paused`, so between that and the pause rule above there
is **no unattended scheduling at all** - chosen knowingly over a hold that
silently lets some items through.

> Injected JS lands inside a template literal in `extension.js`, so the queue
> fragments must contain **no backticks and no `${`** (even in comments) - they
> would break out of the string. `node --check` the *patched* `extension.js`
> (not just the standalone script) to catch this.

## Tests

    node patches/prompt-queue/tests/run-all.mjs

`order.test.js` (32 checks) runs `model.js` + `schedule-lib.js` +
`schedule-order.js` themselves, eval'd with only `Q`, `paused`, `isBusy` and
`render` stubbed. It pins the decisions above rather than the mechanics: a
holding timer not being overtaken, the same timer released leaving the lane
entirely, a due floating item firing past a gate it was never behind, `paused`
stopping scheduled items too, a parked gate holding nothing, lane positions
skipping floating rows, and the two defaults (a timer holds, an at-time does
not) - each of which was a live bug or is the reason one is gone.

`saved.test.js` (38 checks) runs `saved/store.js` itself - eval'd, not
re-implemented - with only its outside world stubbed (localStorage, `Q`,
`isBusy`, `render`). It pins the decisions rather than the mechanics: an
at-time degrading to a plain item, attachments never reaching the store, a
loaded timer coming back inactive, loading appending and parking the queue only
while idle, a corrupt or foreign store reading as empty, and the cap. Then
`check-injected` and `check-ps1`.

`limit.test.js` (14 checks) runs `session.js` + `usage-limit.js` against a
plain store: a refused turn parks the queue and says which limit, a finished
one does not, usage credits and an `allowed` frame and a passed reset time all
lift it, an empty queue is never parked, and a second pass never wraps the
store twice.

**The fragment list is `order.json`, read by both `patch.ps1` and
`tools/check-injected.mjs`.** They used to keep a copy each, and when the
`saved/` fragments landed only `patch.ps1` learned about them - the checker
went on reporting "ok (18 fragments)" for a bundle that ships 27, with six
files and both lib runtimes never scanned. Add a fragment to `order.json` and
nothing else needs telling.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting anything.

## Items a responder wrote

`window.__qAuto.add(text, { off })` puts a line in the queue as an **ordinary**
item: same position at the end, same menu, same skip checkbox, same position box,
same editable text, same persistence. The only difference is `it.auto`, which puts
a small mark on the row (`.__qAi`, an orange four-pointed star with the tooltip
*Written by a responder, not by you*). A duplicate of one is still marked - a copy
of a written line was still written.

It does not go through `commitComposerToQueue`, which pauses the queue on an idle
add - and idle is exactly when a responder writes, so that route would hold the
queue every time. This is the same push the composer ends in, without that.

`off: true` parks the item skipped: present, editable, one click from being sent.
That is what a responder set to ask before sending uses, and it is also forced for
an answer that did not parse, whatever the responder says.
