# copy-message

> Layout: `patch.ps1` + `copy-message.css` + `copy/*.js` fragments, concatenated
> in the explicit `$order` in `patch.ps1` (`config-clipboard` opens the IIFE /
> `<script>`, `place-observe` closes it).

Adds a copy-to-clipboard icon to **every** chat message - the user's and
Claude's - so any single message can be lifted out without selecting it by hand.

## What it does

Only **actual messages** are decorated. An assistant reply is split into one
`message_<hash>` block per content item, so a tool call, a tool result and a
collapsed "Thinking" row are each a separate block - decorating every one of
them buried the transcript in icons. A block qualifies when it is a user bubble,
or when it renders markdown (`root_<hash>`) that is *not* nested inside a
thinking block or a tool wrapper. The ancestor check matters: an expanded
thinking block renders markdown of its own, so a plain lookup would match it.

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
- **In normal flow the button is kept as the *last* child, every pass.**
  Checking only "is it still parented to the message" is not enough: React
  knows nothing about our node, so while a reply streams in it appends each new
  paragraph *after* it, stranding the icon in the middle - visually at the top
  of the answer, which is what it looked like from the outside. Inside the
  actions container the opposite rule applies: only re-parent, never re-order,
  or we would fight React each time it mounts or unmounts its popup there.
- **Anchored on `[title="Message actions"]`,** a semantic string, rather than on
  the container's minified class.
- **Copies the bubble, not the wrapper.** A user message's wrapper also holds
  the actions container (and, while open, its popup's option labels); reading
  `userMessage_<hash>` keeps that out of the clipboard.
- **Skips messages with no text yet.** A wrapper still empty mid-stream gets no
  button; the next mutation picks it up.
- **That "is there text yet" test reads `textContent`, never `innerText`.**
  `innerText` is defined in terms of *rendered* text, so reading it flushes
  pending style and layout synchronously. The question is asked from the
  observer pass about every message that has no button yet - which is every
  thinking block and every tool call, on every burst, for as long as the
  transcript stays open - so the forced flushes grow with the conversation and
  on a long one cost more than the rest of the patch together. `textContent`
  answers the same question off the tree and forces nothing. The *copy* still
  reads `innerText`, where the rendering is the point: it is what puts the
  blank lines between blocks on the clipboard.
- **The button holds only an `<svg>`,** which `innerText` ignores - so the
  copied text needs no filtering of our own markup.
- **`clipboard.writeText` with an `execCommand` fallback.** The webview grants
  the async clipboard API, but it rejects when the document is not focused.
- **The flow-placed icon must contribute ZERO height.** This is the subtlest
  constraint in the patch. The app decides whether to keep the transcript
  pinned with `stuck = scrollHeight - scrollTop - clientHeight < 50` and then,
  in a layout effect, sets `scrollTop = scrollHeight`. Our button is attached
  one frame *later*, from the MutationObserver - so any height it adds lands
  after the app has already scrolled. The view then sits that many pixels above
  the bottom with the app unaware, and the next update re-pins and takes up the
  slack in one step: a visible jump on every block of reply text. A negative
  bottom margin equal to the box (`height:16px; margin:0 0 -16px`) cancels the
  contribution exactly; the icon overhangs into the 16px gap the app's own 8px
  padding already leaves between blocks. `position:relative; z-index:1` keeps it
  clickable, since the next block is painted after it. Measured: without this,
  6 of 12 agent steps left the view 19px off the bottom; with it, 0 of 12.
- **The icon must also not be a scroll anchor.** The height rule above is only
  half of it. The app keys every content block by `hash + lastModifiedTime`
  (`class jp`, `get key()`) and renders `content.map(c => <Block … key={c.key}>)`,
  so a streaming reply is unmounted and re-mounted on **every chunk**; a fresh
  mount is attached with `appendChild`, i.e. after our icon. For one frame the
  icon therefore sits above the whole reply body, and our own pass puts it back
  the frame after. Chromium selects it as the scroll anchor and, keeping it
  visually still, moves `scrollTop` up by the height of the body it leapt over -
  once per chunk, all day, invisibly, because the app re-pins straight after.
  The moment the reader scrolls more than 50px from the bottom the app stops
  re-pinning and the next adjustment lands as a jump to the end of the previous
  message. `overflow-anchor: none` on the icon is the whole fix; it covers the
  `<svg>` too, and the same declaration on the glyph alone does nothing.
  Measured on 2.1.241: 9/9 of the app's pin writes saw a collapsed offset
  without it and 0/9 with it, and a bare foreign element added to an *unpatched*
  bundle reproduces it exactly (0/9 → 9/9 → 0/9 as it is added, frozen, moved
  again). Anchoring adjustments fire no scroll event and leave no JS stack, so
  measure by reading `scrollTop` inside an instrumented setter on the container.
- **Normal flow, not absolute positioning, for the non-bubble placement.** The
  `rtl` patch flips the whole panel to `direction: rtl`, which sends an
  `inset-inline-end`-pinned button to the far side of the viewport (the message
  wrapper is full-width). Flow layout keeps the icon next to its message under
  both directions and never covers the last line of text.
- **The reveal is keyed off the app's own button, not the container.** The
  container is rendered as
  `` `${lu.container} ${c ? lu.messageHovered : ""}` `` - but the CSS module map
  `lu` has **no `messageHovered` entry**, so while a message is hovered the app
  literally emits `class="container_<hash> undefined"`. Nothing can select that.
  The signal that does work is `subtleVisible_<hash>`, which the app adds to its
  own button in the same render, so the rule is
  `div:has(> [class*="subtleVisible"]) > .__ccCopyAct`. Our icon then appears
  and disappears exactly with the app's, never on its own.
- **The pointer must not focus the button.** Inheriting the app's
  `actionButton_<hash>` also inherits its `:focus{opacity:1}`, so a click left
  our icon pinned on screen after the pointer had moved away - the app's own
  button faded, ours stayed, and only after a copy, since only a copy involves
  a click. `mousedown` + `preventDefault()` suppresses the pointer's default
  focus; keyboard focus (Tab) is untouched and still reveals the button.
  Verified by isolation: with everything else held constant, a bare `blur()`
  took the button from opacity 1 to 0.
- **The copied check sets colour only, never opacity.** Forcing it visible
  would pin the button for the full 1.2s after the pointer left; visibility
  stays owned by hover, so the check shows while you are there and vanishes
  with the app's button when you leave.
- **Hash-free CSS.** The stylesheet names only our own classes plus generic
  attribute matches (`[class*="subtleVisible"]`, `div:has(> .__ccCopyAct)`).
  The minified names live in `lib/Extension.ps1` and are substituted into the
  JS. Each is anchored on a key that is unique across the whole bundle, since
  the obvious ones are not: `$Ctx.MsgHash` from `messagesContainer_<hash>`;
  `$Ctx.MsgActionBtnClass` from `subtleVisible_<hash>` (four modules define an
  `actionButton_<hash>`, only this one defines `subtleVisible`);
  `$Ctx.MdRootClass` from `codeBlockWrapper_<hash>` (`root` alone is far too
  common); `$Ctx.ThinkingClass` from `thinkingSummary_<hash>`; plus
  `$Ctx.ToolUseClass` / `$Ctx.ToolResultClass`.
