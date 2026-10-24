# prompt-queue (desktop)

A Codex-style queue for the Code tab: line up messages while Claude is working,
and they go out one per turn, the moment a turn truly ends.

This is the desktop sibling of the parent repo's `prompt-queue`. The logic is
the same shape; the bindings are rewritten for the Code web app's DOM, which is
what the desktop Code tab loads (`claude.ai/epitaxy`).

## The pieces (`queue/*.js`, concatenated in `renderer.order`)

- `session.js` - the conversation id (for per-conversation persistence).
- `busy.js` - run state from the DOM: busy while the send button is a Stop
  button (`code-prompt-stop`). The app keeps it Stop for the whole turn,
  subagents included, so "finished" fires only when the turn is really over -
  the "only when Claude truly finished" rule, for free.
- `store.js` - the ordered list + paused flag, persisted to localStorage per
  conversation. Pure state.
- `compose.js` - the one place that touches the editor: read text, clear,
  insert, and send (clear + insert + click the app's own Send button).
- `enqueue.js` - opt-in only, as in the VS Code queue: plain Enter and Send are
  never touched. Alt+Enter (capture phase, ahead of the editor) commits the draft
  through `__ccq.commitDraft`. An add while idle parks the queue first
  (idle-hold), so you build a batch and release it with Resume.
- `add-button.js` - the add-to-queue ghost button just left of Send, wearing the
  class list and `data-cds` attributes of the app's own microphone button, with
  a styled tooltip naming Alt+Enter. Click = the same commit.
- `stop-park.js` - clicking Stop parks a non-empty queue: a stopped run is not a
  finished one, and the busy signal alone cannot tell them apart.
- `drive.js` - on each finish, if not paused and the composer is clear, send the
  next item; an item is dropped only once its send is confirmed by the next
  start, else retried.
- `panel.js` - the list above the composer with reorder, edit (pulls the item
  back into the composer) and remove, plus pause/resume and clear in the header.
  Its style is injected on init, never at eval (an eval-time node is wiped by the
  app's first render). All nodes owned; re-attaches if the composer remounts.

## Status

Built against anchors confirmed live on `claude.ai/code` (the editor
`code-prompt-input`, `code-prompt-send`, `code-prompt-stop`, `ChatComposer`).
Verified live in a real Chrome on `claude.ai/code`, the payload run in an
isolated world as the preload runs it: the button lands before the send cell
with the app's look, Alt+Enter and a click each queue the draft and clear the
box, an idle add parks the queue, and nothing is sent. The drain (Resume, and
an add while busy going out after the turn) is unchanged and not yet driven live.

## Not yet ported from the webview queue

Scheduling, saved queues, continue-after-usage-limit, and the in-panel log are
the parent queue's advanced features; they are pure-logic modules there and are
the next thing to port on top of this core.
