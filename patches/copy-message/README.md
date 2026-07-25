# copy-message

Adds a copy-to-clipboard icon to **every** chat message - the user's and
Claude's - so any single message can be lifted out without selecting it by hand.

## What it does

Two placements, chosen per message by the script:

- **User messages** - the icon joins the app's own *Message actions* container
  (the round rewind/fork button at the corner of the bubble) and wears the
  app's `actionButton_<hash>` class, so it is the same 20px round button and
  fades in with the same hover reveal. Nothing about its look is re-specified.
- **Everything else** - normal flow, its own 18px line at the end of the
  message, at the start edge, 30% opacity, fully opaque on hover / focus.

Clicking copies that message's text - for a user message, the bubble's text
only - and flashes a green check for 1.2s before reverting to the copy glyph.

## Why it is built this way

- **Re-attached *and re-placed* from a `MutationObserver`, not once at load.**
  The message list is React-rendered and re-renders on every stream chunk, so a
  one-shot pass would only decorate the messages that existed at load. The
  actions container also appears after the bubble does, so placement is
  re-asserted every pass - `appendChild` on an already-attached node just moves
  it, which makes that idempotent. Observer bursts are coalesced into one
  `requestAnimationFrame` pass.
- **Anchored on `[title="Message actions"]`,** a semantic string, rather than on
  the container's minified class.
- **Copies the bubble, not the wrapper.** A user message's wrapper also holds
  the actions container (and, while open, its popup's option labels); reading
  `userMessage_<hash>` keeps that out of the clipboard.
- **Skips messages with no text yet.** A wrapper still empty mid-stream gets no
  button; the next mutation picks it up.
- **The button holds only an `<svg>`,** which `innerText` ignores - so the
  copied text needs no filtering of our own markup.
- **`clipboard.writeText` with an `execCommand` fallback.** The webview grants
  the async clipboard API, but it rejects when the document is not focused.
- **Normal flow, not absolute positioning, for the non-bubble placement.** The
  `rtl` patch flips the whole panel to `direction: rtl`, which sends an
  `inset-inline-end`-pinned button to the far side of the viewport (the message
  wrapper is full-width). Flow layout keeps the icon next to its message under
  both directions and never covers the last line of text.
- **Hash-free CSS.** The stylesheet names only our own classes plus generic
  attribute matches (`[class*="messageHovered"]`, `div:has(> .__ccCopyAct)`).
  The minified names live in `lib/Extension.ps1` as `$Ctx.MsgHash` (from the
  unique `messagesContainer_<hash>`) and `$Ctx.MsgActionBtnClass` (from
  `subtleVisible_<hash>` - four modules define an `actionButton_<hash>`, and
  only this one defines `subtleVisible`), substituted into the JS.
