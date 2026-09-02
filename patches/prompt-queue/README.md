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

The add button is re-anchored every tick (`ensureAddButton`) because the app
re-renders its own footer; `insertBefore` on the existing node just moves it,
so it never duplicates.

## Stopping Claude parks the queue (`stop-pause.js`)

Pressing **stop** while a turn is running sets `paused`, so the queue holds
instead of firing the next item the moment the turn ends. Stopping means "not
this, and not whatever came after it" - draining straight into the next prompt
is the opposite of what the gesture asked for. The panel header shows
`paused - N queued` with the play button, and the state is persisted like any
other pause; one click releases it.

The hook is on the **session's own `interrupt()`**, decorated per session
(`hookStopPause`, re-run each tick because the object is replaced when the
active conversation changes; guarded by `__qStopHook` so it decorates once,
and isolated in its own try/catch - it decorates someone else's object, and a
throw there would otherwise take the rest of the tick down with it, on that
tick and every one after).
That is the single funnel every stop path goes through - the composer's stop
button (`onClick` -> `session.interrupt()`), a plain Escape (the app's
body-level handler), and `restartClaude`. It runs **synchronously with the
gesture**, i.e. before `busy` flips false and before the 150ms flush tick wakes
up. Watching for the same gestures in the DOM instead would mean
re-implementing the app's own conditions *and* would still race the flush; and
`busy` going false is not a signal on its own - it is identical for a normal
turn end.

Two guards keep it to real stops: `interrupt()` also runs for a plain Escape
while **idle** (the app's handler is not gated on busy), which is not a stop -
so `isBusy()` must hold; and an empty queue has nothing to park, so `paused` is
never set behind the user's back when the queue isn't in use.

Note this is the same `paused` as the play/pause button, so a **due** scheduled
item still fires (see `firstSendableIndex`) - a commitment to a wall-clock
moment is deliberately not cancelled by a pause, however that pause arrived.

Decorating an instance method is safe here (an own property over the prototype,
`orig.apply(this, arguments)` returns the original promise untouched) - it is
not the `acquireVsCodeApi` wrap the root CLAUDE.md forbids.

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
  `syncSession` (run each tick) swaps `Q` when the active id changes.
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
`queue/modal-shell.js` for the overlay, head, foot, Esc, backdrop, focus trap
and one-modal-at-a-time.

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

Both jump-to-end buttons go through `moveToEnd(i, last)`, which is a call to
the existing `moveItemTo(it, p)` with a clamped position - the queue is never
spliced a second way.

## Row actions menu (`row-menu.js`)

A row carries a lot of controls, so the per-row **send** and **delete**
buttons were folded into one kebab (three dots) sitting beside the reorder
arrows at the leading edge. It opens a small popup with three items:

- **Send now** - jump the queue order, the schedule and the paused hold
  (`sendNow`). When it cannot run - the item is skipped, Claude is mid-turn,
  or another send is in flight - **the reason takes the label’s place** in
  amber and the item goes inactive, rather than hiding in a tooltip. The old
  inline button was only blocked for a skipped item (by CSS,
  `pointer-events:none`); in the other two it looked clickable and then
  silently did nothing.

  `sendBlocked(it)` is re-run **on the click, not only while the menu is
  built**: the turn state can flip during the seconds the menu sits open, and
  `sendNow` would then hit its own `isBusy()` guard and `return` - a live item
  doing nothing at all with no feedback. On a refusal the menu stays open so
  the reason can be read. The reasons are kept short and `.__qMenu` has a
  `min-width` that fits the longest of them, so the swap moves nothing.
- **Duplicate** - `duplicateItem` clones the item *with everything around it*
  (schedule `mode`/`at`/`start`/`dur`, the `missed`/`rearm` restart flags, the
  skipped state, attachments) and inserts it directly below the original. An
  at-time copy keeps the same wall-clock moment; a timer copy keeps the same
  remaining countdown, so the copy reads identically to its source.
- **Delete** - `removeItem`.

The **clock cell is deliberately not in this menu**: a schedule stays visible
and one click away in the row itself, exactly as before.

Two things the popup has to get right:

- It is **body-mounted and `position:fixed`** - the queue body scrolls
  (`overflow-y:auto`) and would clip an in-flow menu. `placeMenu` anchors it
  under the button and flips it up / pulls it in at the viewport edges.
- Because it lives outside the panel, `render()` calls `closeRowMenu()` -
  a rebuild would otherwise orphan it. It also closes on outside mousedown,
  `Escape`, scroll (capture, so the queue body counts) and resize.

Menu actions are **identity-based** (`Q.indexOf(it)`), not index-based: an
item above can flush between opening the menu and clicking an entry.

## Scheduling (`schedule-lib.js`, `schedule-clock.js`, `schedule-modal.js`)

Every row has a clock button. Clicking it opens a modal with three choices:

- **Queue** (default) - sent in normal FIFO order.
- **Timer** - a relative delay from now (preset chips + custom minutes).
- **After** - a timer that only starts once the item reaches the front (the
  message before it has finished). Shown as "Waiting · Nm" until then, then a
  live ring. Position-relative: moving it back resets the countdown, which
  re-arms after its new predecessor finishes (`armAfterItems` in `schedule-lib.js`,
  gated in `firstSendableIndex`). Un-armed on restart, re-arms by order.
- **At time** - quick presets (In 1 hour / This evening / Tomorrow 9 AM ...)
  plus an exact `datetime-local`; must be in the future.

The modal follows current UX guidance: a live **natural-language summary**
(`fmtSummary`, e.g. "Sends tomorrow at 9:00 AM") updates as you choose so the
outcome is always explicit; the CTA label reflects the choice (Schedule / Done);
and it is accessible - `role="dialog"` + `aria-modal`, focus trap, focus
returned to the clock on close, Esc / X / backdrop all dismiss, and a subtle
entrance animation that respects `prefers-reduced-motion`.

Choosing Timer/At-time sets `it.mode` + an absolute target `it.at` (and
`it.start` as the ring baseline). The clock icon changes (stopwatch / calendar,
in accent colour) and a **conic-gradient countdown ring** (`__qRing`) fills
0->100% as the send time approaches; `tickRings()` advances it every 150ms and
refreshes the "in Xm" label. "Clear schedule" reverts to a plain queue item.

**Send logic** lives in `firstSendableIndex` (`model.js`): a *due* scheduled
item (its time arrived) fires even while the queue is paused; future-scheduled
items are pending and skipped; plain items send in order only when not paused;
`missed` / `rearm` items are inactive (skipped) until the user acts.

### Restart policy

We are a client-side scheduler (like classic Outlook's Outbox, not Gmail's
server side): a schedule only fires while the editor is open. The full schedule
(`at`, `start`, `mode`, `dur`) is in localStorage, so on reopen (`persist.js`
`loadQueue`) each item is restored by type - a decision made deliberately for
an AI agent, where auto-running a prompt you weren't watching is the real risk:

- **At-time still in the future** -> stays active, keeps ticking, fires at its
  time (if the editor is open then).
- **At-time whose moment passed while closed** -> flagged `missed` (amber, held,
  "Missed · H:MM"); never auto-sent. Click to reschedule.
- **Timer** (a relative countdown - its origin is lost across a restart) ->
  `rearm`: inactive, shown as "Restart Nm"; one click re-runs the duration from
  now (`rearmTimer`).

This is the Quartz "discard / do-nothing" misfire stance plus a visible state,
chosen over "fire-once" / "fire-all" catch-up because our messages execute.

> Injected JS lands inside a template literal in `extension.js`, so the queue
> fragments must contain **no backticks and no `${`** (even in comments) - they
> would break out of the string. `node --check` the *patched* `extension.js`
> (not just the standalone script) to catch this.

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
