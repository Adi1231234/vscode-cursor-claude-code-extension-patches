# Prompt Queue

**Type:** feature
**Touches:** `extension.js + webview/index.css`
**Guard marker:** `/* QUEUE */`

Codex-style queue: hold messages while Claude is busy, edit / reorder / skip, sent one per turn. `queue.css` -> stylesheet, ordered `queue/*.js` fragments (each < 150 lines) concatenated and injected after the INPUTRTL/ZOOM script (uses the webview nonce + image-preview class hash).

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

## Persistence (`persist.js`)

The queue survives a full Cursor restart, per session:

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
  reopening Cursor never auto-fires messages - the user releases with play.

If the session id can't be read, persistence silently disables (the queue
still works in memory) rather than risking a wrong-keyed write.

## Debug log viewer (`log.js`)

A tiny in-webview logger: `ccLog(tag, ...)` buffers to an in-memory ring (2000);
`persist.js` logs session resolution / save / load. **`Ctrl+Alt+L`** opens a
modal listing the logs plus an environment probe (which globals exist,
`localStorage`, the resolved session id, ...). The button itself is hidden by
default - `window.__ccLogBtn()` shows it, `window.__ccLogs()` returns the array.
Everything is in-memory + on-demand; it never touches `localStorage` at load and
never wraps `acquireVsCodeApi` (both break the webview - see the root CLAUDE.md).
This is how the persistence bug above was finally diagnosed inside the real webview.

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
server side): a schedule only fires while Cursor is open. The full schedule
(`at`, `start`, `mode`, `dur`) is in localStorage, so on reopen (`persist.js`
`loadQueue`) each item is restored by type - a decision made deliberately for
an AI agent, where auto-running a prompt you weren't watching is the real risk:

- **At-time still in the future** -> stays active, keeps ticking, fires at its
  time (if Cursor is open then).
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
