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

## The fix: decide once per message, not per block

Per-block detection is the bug, not the cure. An earlier version of this patch
replaced the app's first-strong rule with a majority-of-letters vote per block, and
that broke `## 3. ה-benchmark שבנינו`: nine Latin letters in one word outvoted the
seven Hebrew letters around it, so a heading the app had rendered **correctly** was
flipped to LTR. Any symmetric per-block vote has that failure mode.

What the standards actually prescribe:

- The HTML Living Standard calls the auto/first-strong heuristic "**very crude**" and
  urges it "only as a last resort **when the direction of the text is truly
  unknown**". Here it is known.
- W3C [Structural markup and right-to-left text in HTML](https://www.w3.org/International/questions/qa-html-dir):
  declare the direction once at the root, "**only use the dir attribute on structural
  elements on the rare occasions when the base direction needs to change**", and
  "never use CSS to apply the base direction".
- W3C [string-meta §4.1](https://www.w3.org/TR/string-meta/): first-strong "is **NOT
  recommended when used alone**", and it names this exact failure - the string
  `HTML و CSS: ...` detected as LTR.
- [UAX #9 HL1](https://www.unicode.org/reports/tr9/#HL1) permits a higher-level
  protocol to set the paragraph level "on the basis of the context, such as on a
  table cell, paragraph, **document**, or system level".

So `bidi/*.js`:

1. Counts the words of a whole message (one `root_<hash>`), code spans excluded, and
   writes `dir="rtl"` or `dir="ltr"` on that root. A word is RTL when its **first
   strong character** is RTL, so `ה-benchmark` is a Hebrew word; the RTL share is
   compared against **0.4**, not a half. Both details come from
   `goog.i18n.bidi.estimateDirection` (closure-library), which is the same decision
   made in production - RTL text nearly always carries Latin terminology while the
   reverse is rare, so a symmetric vote is biased against RTL from the start.
2. Lets every block inherit that. A block gets its own `dir` **only** when it carries
   letters of the opposite script and none of the message's own (an English path or
   quote inside a Hebrew answer, a Hebrew line inside an English answer). That is the
   "rare occasion" the W3C guidance means.
3. A block with no strong letter either way - a numbers-only cell, a `---` separator -
   inherits like any other. It must not default to LTR (string-meta: "the default
   direction should not be set to LTR"), and flipping it would also drag a list
   item's marker inline through the `__ccBidiOdd` rule.
4. A message with no strongly directional word at all is left untouched.

`message-bidi.css` overrides `unicode-bidi` back to `isolate` for the blocks of a
message the script has decided on, with a selector that out-specifies the app's rule
(0,3,1 vs 0,1,1). Scoped to `[class*="root_"][dir]`, so if the script does not run,
the app's behaviour is unchanged.

Measured over 122k rendered blocks from real transcripts: the per-message decision is
effectively binary - 97% of messages are either under 10% or over 60% Hebrew words,
and only 0.4% fall between 10% and 50%, so any threshold in that range gives the same
answer. 98.4% of blocks simply inherit; 1.6% take the per-block exception; 5% change
versus the previous per-block vote.

Lists need one extra touch. The list element itself is deliberately left alone, so
all its markers stay on the message's side and it reads as one column - but an item
that ends up reading the other way would hang its marker off the far side of the
message, past the list padding (which sits on the opposite side), where the markdown
root's `overflow-x: hidden` clips it away entirely. `bidi/observe.js` marks exactly
those items and the stylesheet draws their marker inline instead.

A `MutationObserver` re-asserts the verdict, rescanning only the message roots a
mutation actually touched (a streaming reply mutates one block per frame, while a
long chat holds hundreds that cannot have changed). `characterData` is observed
because a streaming reply grows an existing text node in place; attributes are
deliberately **not** observed, or our own `dir` writes would feed back. A reply that
opens in one language and continues in the other therefore flips direction once,
mid-stream, and settles on the final count.

Note: the webview escapes every bidi control character (RLM, LRM, isolates) into a
literal `\uXXXX` string before rendering, so direction cannot be nudged from the text
itself - see the `CLAUDE.md` conventions.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`).
Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting
anything.
