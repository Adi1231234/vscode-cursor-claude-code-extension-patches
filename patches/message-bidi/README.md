# Message bidi

**Type:** bug fix
**Touches:** `webview/index.css`, `extension.js`
**Guard marker:** `/* MSGBIDI */` (both files)

A Hebrew answer whose **first word is English** rendered left-to-right: the Latin
token pinned to the left edge, the sentence-final `.` on the left, segments visually
out of order - while still looking right-aligned, which is what hid the cause.

## Root cause (proven)

The extension's own markdown stylesheet ships

```css
.root_-a7MRw :is(p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th){unicode-bidi:plaintext}
```

`unicode-bidi: plaintext` instructs the UA to **ignore the computed `direction`** and
derive each block's base direction from the first strong directional character
instead (rules P2/P3 of the Unicode bidi algorithm). The `rtl` patch's
`[class*="messagesContainer_"]{direction:rtl}` therefore never reaches a message
block. When a Hebrew paragraph opens with `llama.cpp`, the first strong character is
Latin, so the whole block lays out LTR and the Hebrew runs get reordered inside it.
`text-align` is unaffected by `unicode-bidi`, so `text-align:right` still applied -
a right-aligned block that reads backwards.

Verified in Chrome against a harness built from the real markup: with
`direction: rtl !important` set on the `<li>` itself the Latin word **stayed** at the
left edge (x=48 inside an element spanning 21..1043); switching only `unicode-bidi`
to `isolate` snapped it to the right edge (1043). It is not a specificity fight -
`plaintext` is defined to disregard `direction`. Setting `dir=` alone does not help
either, for the same reason.

## The fix

Two halves, and neither is useful without the other:

- **`message-bidi.css`** overrides `unicode-bidi` back to `isolate`, with a selector
  that out-specifies the app's rule (0,3,1 vs 0,1,1). Scoped to `[dir]`, so it only
  ever touches blocks the script has decided on - if the script does not run, the
  app's behaviour is unchanged.
- **`bidi/*.js`** replaces the first-strong-character heuristic with a
  **majority of strong letters** one, per block, and writes `dir="rtl"` / `dir="ltr"`.
  Text inside `code` / `pre` is excluded from the count: a flag or an identifier is
  terminology, not the language of the sentence, and it renders LTR regardless.
  A block with no strong letters (or a dead heat) is left without `dir` and keeps
  the app's own behaviour.

So a Hebrew answer reads RTL no matter which word opens it, and an English answer
still reads LTR instead of being force-flipped.

Lists need one extra touch. The list element itself is deliberately left alone, so
all its markers stay on the panel's side and it reads as one column - but an item
that ends up reading the other way would hang its marker off the far side of the
message, past the list padding (which sits on the opposite side), where the markdown
root's `overflow-x: hidden` clips it away entirely. `bidi/observe.js` marks exactly
those items and the stylesheet draws their marker inline instead.

A `MutationObserver` re-asserts the verdict, rescanning only the markdown roots a
mutation actually touched (a streaming reply mutates one block per frame, while a
long chat holds hundreds that cannot have changed). `characterData` is observed
because a streaming reply grows an existing text node in place; attributes are
deliberately **not** observed, or our own `dir` writes would feed back.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`).
Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting
anything.
