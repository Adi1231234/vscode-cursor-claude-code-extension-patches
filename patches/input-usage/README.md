# input-usage

> Layout: `patch.ps1` + `expose.js` (the webview-bundle half) + `usage.css` +
> `usage/*.js` fragments, concatenated in the order `usage/order.json` gives
> (`open` opens the IIFE / `<script>`, `live` closes it).

How much of your usage is left, on a thin line at the very bottom of the
composer box, right under the footer row:

    Session 59% left · Weekly 56% left

"Session" is the 5-hour window and "Weekly" the 7-day one - the app's own
names for them ("Session (5hr)", "Weekly (7 day)"), shortened to fit a line.

## Where the numbers come from

The app already has them. Every reply's `rate_limit_event` carries the
account's windows, the host relays them to every panel as
`panel_usage_update`, and the webview merges both into **one module-level
signal** (`var <sig>=signal(null)` beside `function <merge>(windows)`), which it
draws only in the session list's "Account & usage" section. Each window is
`{ utilization: 0..1, resetsAt: <seconds> }`.

Nothing outside the bundle can reach that signal, so the webview half of this
patch adds one getter right before the merge function:
`globalThis.__ccUsageWindows = function () { return <sig>; }`. Both names are
captured, never written down: the merge function from
`case"panel_usage_update":<merge>(<x>.request.unifiedWindows)`, the signal from
that function's first statement.

A window past its `resetsAt` is fully left again, and no event says so. The
app's own meter reads it that way (`resetsAt*1000 <= now` -> 0% used), and so
does this line.

**When the line is empty.** The host reads the windows for the first time
when a conversation's CLI starts, and keeps one merged copy for every panel.
A panel opened later is handed that copy by the app itself (its session list
asks the host on mount - checked in the lab by disabling an ask of our own,
which made no difference). So after a window reload the line appears once the
first conversation in that window has started, exactly when the app's own
meter fills; on an API key there are no windows and no line.

## Built for the shared renderer thread

Every Claude panel of every window runs on one thread (see "The webview
runtime" in `../../CLAUDE.md`), so this line costs as close to nothing as it
can:

- **A push, never a poll.** The script subscribes to the app's signal; the
  line is written only when a window moves. The text goes through
  `__ccDom.setText`, so a reading that rounds to the same percent writes nothing.
- **One timer, for one moment.** A one-shot `setTimeout` for the next reset
  (a window past its reset changes the line with no event), re-armed each
  time the line is drawn. No interval.
- **Outside the footer row.** The line is the composer `fieldset`'s last child,
  after the footer, so the app's footer fitter never sees it change.
- **The one shared observer, scoped and cheap.** `__ccWatch` with the composer
  as scope; the callback only checks that the line is still the box's last
  child, by comparing record targets. Typing never gets past that check.

Measured in the lab on 2.1.292 (2026-10-07):

- **Idle:** 0 mutation records in the whole panel over 4 s.
- **Typing 30 characters:** 0 records written by this patch.
- **CPU:** a profile sampled every 50 us across 80 keystrokes caught none of
  this patch's functions running.
- **A streamed reply:** 0.5-2 ms of its functions per reply in a CPU profile,
  and toggling the patch inside one lab moved the panel's script time by less
  than the run-to-run noise.
- **Seven panels idle:** 0 mutation records in each over 15 s.

## Look

Copied off the app's own message time stamp (`.stamp_<hash>`:
`--app-secondary-foreground`, `.85em`, `16px` line), right-aligned like it,
with the footer row's own `5px` side padding and `--app-spacing-small` below.
It ellipsizes rather than wraps; at a 214px panel it still fits whole.

## Tests

`node patches/input-usage/tests/text.test.js` - the line's text and when it
next changes, from window shapes read off a live panel.
