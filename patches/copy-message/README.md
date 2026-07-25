# copy-message

Adds a small copy-to-clipboard icon at the end of **every** chat message - both
the user's messages and Claude's - so any single message can be lifted out
without selecting it by hand.

## What it does

- Appends a `.__ccCopy` button as the last child of each message wrapper
  (`message_<hash>`).
- Clicking copies that message's `innerText` and flashes a green check for
  1.2s, then reverts to the copy glyph.
- The icon sits in normal flow on its own 18px line under the message, at the
  start edge, at 30% opacity - fully opaque on hover / keyboard focus, so it
  never competes with the text.

## Why it is built this way

- **Re-attached from a `MutationObserver`, not once at load.** The message list
  is React-rendered and re-renders on every stream chunk; a one-shot pass would
  only decorate the messages that happened to exist at load. Observer bursts are
  coalesced into one `requestAnimationFrame` pass.
- **Skips messages with no text yet.** A wrapper that is still empty mid-stream
  gets no button; the next mutation picks it up.
- **The button holds only an `<svg>`.** `innerText` ignores SVG, so the copied
  text needs no filtering of our own markup.
- **`clipboard.writeText` with an `execCommand` fallback.** The webview grants
  the async clipboard API, but it rejects when the document is not focused;
  the hidden-textarea path covers that.
- **Normal flow, not absolute positioning.** The `rtl` patch flips the whole
  panel to `direction: rtl`, which sends an `inset-inline-end`-pinned button to
  the far side of the viewport (the message wrapper is full-width). Flow layout
  keeps the icon next to its message under both directions and never covers the
  last line of text.
- **Hash-free CSS.** The stylesheet only ever names `.__ccCopy` and keys the
  reveal off `:hover > .__ccCopy`, so no minified class name is baked into it.
  The one minified name (`message_<hash>`) is detected once in
  `lib/Extension.ps1` as `$Ctx.MsgHash` (from the unique
  `messagesContainer_<hash>` in `webview/index.js`) and substituted into the JS.
