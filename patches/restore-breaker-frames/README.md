# Restore breaker: an open settles without frames

**Type:** bug fix
**Touches:** `webview/index.js`
**Guard marker:** `/* RESTOREFRAMES */`

A Reload Window replaced open conversations with empty chats. On 2026-10-18 it
took six tabs of one window at once.

## The cause, proven

2.1.301 added a restore breaker. When a panel starts opening a conversation it
saves `unfinishedOpen: {sessionId, count + 1}` in its webview state. Once the
conversation has loaded it waits for **two animation frames, then 3 s**, and
only then clears it. On the next boot, `count >= 2` for the conversation it
would restore makes the tab skip it: a new empty chat, plus a notice
("... was not reopened. It did not finish opening the last 2 times") with
**Open it anyway**. The notice is gone after one more reload.

The breaker equates "no frames" with "this conversation froze the panel". A
visible panel can get no frames while its scripts run fine:

- a window whose webview renderer had stopped compositing (measured live:
  `requestAnimationFrame` never fired in ten minutes, no `paint` entry);
- every background tab: the editor hides the iframe, the document still reports
  `visibilityState: "visible"`, and frames stop (measured on five background
  tabs in three windows).

What happened on 2026-10-18, from the transcripts and the saved tab state:

- Every one of the six conversations was opened by the 1st reload (14:52) and
  by the 2nd (14:55:45), ran about 190 s and 55 s, and was never opened again.
- After the 3rd reload (14:56:47) each tab held a new empty chat, with the old
  conversation only in `unfinishedOpen: {..., count: 2}`.
- Nothing had painted since the 1st reload, so the notice was never seen.

Reproduced in the lab (2.1.301), with the overlays hidden so the panel runs but
gets no frames, and three real reloads. Unpatched: count 1, count 2, then an
empty chat and the notice. Patched: the conversation came back all three times,
state clean, and the log says why.

## The fix

`js/settle.js` replaces the breaker's wait. The two frames race a timer with
the same 3 s. If no frame comes but the timer runs, the panel is alive and only
not painting, so the open settles, just as the app already settles it for a
hidden document. A panel the conversation really froze runs neither the frames
nor the timer, so the breaker still trips for it. The decision goes to the
panel log as `[restore] no frame in 3000 ms: ...`.

`tests/settle.test.js` runs the patched wait beside the verbatim 2.1.301
function (`tests/upstream-2.1.301.js`) on a fake clock: same result when frames
flow or the document is hidden, and only the patched one settles without frames.

Bundles without the breaker (2.1.300 and before) report `[skip]`: the notice
text is the test for whether it is there, so a reshaped breaker is a `[miss]`.

## A tab that was already skipped

The patch stops the count from growing. It does not touch a count that is
already 2: such a tab still opens empty, once. Open the conversation from
Session history in that tab, or click **Open it anyway** if the notice is
still showing.
