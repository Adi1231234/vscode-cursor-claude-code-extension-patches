# inline-code-copy

> Layout: `patch.ps1` + `inline-code-copy.css` + `code/*.js` fragments,
> concatenated in the explicit `$parts` list in `patch.ps1` (`config` opens the
> IIFE / `<script>`, `dblclick-copy` closes it, `lib/js/ccCopyText.js` in
> between is the shared clipboard runtime).

**Double-click an inline code chip in the transcript and it is copied.**
The little `` `dir="rtl"` ``-style chips are exactly the bits you want to lift
out of an answer, and until now the only way was to select them by hand.

## What it does

On a double-click anywhere in the message list, the handler walks up to the
nearest `<code>` and copies its text - then:

- **selects the whole chip**, so it is visible exactly what went to the
  clipboard (a double-click on its own would have selected one word of it);
- **flashes an accent outline** on it for 900ms;
- **shows a small "Copied" label** above it for ~1s.

Inline code gets `cursor: copy` so the affordance is discoverable.

## Why it is built this way

- **Fenced code blocks are excluded** (`code.closest("pre")`). The app already
  renders its own copy button on `codeBlockWrapper_<hash>`, and inside a block
  a double-click is how you select a word. They keep the plain text cursor.
- **Scoped to `[class*="messagesContainer_"]`**, so a `<code>` in the composer,
  the queue panel or a dialog is not affected.
- **One delegated listener on `document`, not a `MutationObserver`.** The
  message list is React-rendered and re-renders on every stream chunk; event
  delegation needs no re-attachment pass at all, and decorates nothing.
- **Capture phase, but neither `preventDefault` nor `stopPropagation`.**
  Capture so nothing can swallow the event first; no cancelling so the app's own
  double-click behaviour is untouched.
- **The "Copied" label is body-mounted and `position:fixed`.** Anything added
  *inside* the message list changes its height a frame after the app has pinned
  the scroll (`stuck = scrollHeight - scrollTop - clientHeight < 50`, then
  `scrollTop = scrollHeight` in a layout effect) - which shows up as the
  transcript jumping. Outside the flow it costs zero height. It is also dropped
  on scroll (capture) and resize, so a stale label never floats over the wrong
  place, and it sets `direction: ltr` because the `rtl` patch flips the
  messages container.
- **The clipboard call is the shared `window.__ccCopyText`** from
  `lib/js/ccCopyText.js` - the same runtime `copy-message` uses, rather than a
  second copy of `writeText` + the `execCommand` fallback (the async API is
  granted in the webview but rejects when the document is not focused).
- **Hash-free CSS.** Only our own classes plus generic attribute matches, so
  nothing here has to track a minified name across extension versions.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by
`../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips
instead of corrupting anything.
