# footer-fit

The input footer row (the buttons under the composer) fits the panel at every
width: nothing is squeezed to nothing and nothing leaves the frame.

## The problem

In a narrow panel the row ran out past the composer's frame: the send button
was cut off at the edge and the permission-mode selector had disappeared.
Measured in the lab on 2.1.280 (zoom 1, no Remote Control, no file open):

- 260px: the mode selector squeezed to 9px, its glyph painting over its neighbours.
- 230px: the mode selector at 0px, the send button 14px outside the frame.
- 170px: the queue buttons outside the frame as well.

At zoom 1.34 (the `zoom` patch) all of that starts at a 400px panel.

## Root cause

Two, and both are in how the footer fits itself.

1. **The app's fit ladder stops before our buttons fit.** The footer measures
   its row on every resize and content change, starting at stage 0 and climbing
   one stage per render while the row does not fit (`data-fit-stage` on the row):
   stage 1 turns the Remote Control and agents pills into glyphs, stage 2 moves
   the model pill onto a row of its own. Stage 2 is the top, because upstream's
   own buttons always fit by then. Ours do not: the settings gear, auto
   follow-up, saved queues and add-to-queue are another 118px, and no stage gives
   that back. What absorbs it instead is whatever has `flex-shrink: 1;
   min-width: 0` - the mode selector, built to ellipsize its label - and then the
   row simply overflows.
2. **The mode selector's narrow form is a viewport query.** It drops its label
   ("Manual", "Bypass permissions") for its glyph under
   `@media screen and (max-width:300px)`. A media query cannot see the row, and
   CSS zoom leaves media queries on the unzoomed viewport (see the zoom bullet in
   `CLAUDE.md`): at zoom 1.34 a 400px panel lays out 299px of row while the query
   still reads 400, so the label stays and takes 70px or more.

## What the patch does

It extends the app's own ladder rather than adding a fitter beside it. The app
keeps rendering from a stage capped at 2, so every `[data-fit-stage]` rule and the
model pill behave exactly as before; the rungs above it reach the row as
`data-cc-fit` tokens, and `fit.css` does the rest:

- **compact** - upstream's own `max-width:300px` form, declaration for
  declaration, applied when the row runs out of room instead of when the viewport
  does. Plus `flex-shrink: 0` on the glyph it leaves, so the mode selector can
  never again be squeezed to nothing.
- **fold-1 .. fold-5** - our buttons fold, one per rung, into a "⋯" overflow
  button that is the twin of the app's "+": the same `addButton addButtonSquare`,
  opening the same `menuPopup` of `menuItem` rows (20px icon box, labels aligned
  with the app's own at 34px), read off the app's CSS-module map at runtime.
  Picking a row clicks the real button, so every control keeps its own handler;
  auto follow-up's own menu hangs from the "⋯" while its button is folded.
- **wrap** - the last resort, when even the app's own buttons do not fit. The row
  breaks between its two halves: `+`, `/` and the pills on the first line, the
  mode, "⋯" and send on the second, aligned to the end.

The ladder runs inside the app's layout effect, which measures right after each
render, so a rung is styled before it is measured: no flicker, and a given width
always lands on the same rungs whether the panel was widened or narrowed to it.

### Fold order

Each button declares its own order with `data-cc-fold`; lowest folds first. A new
footer button picks a free number here and `fit.css` needs a line for it if it
goes past 5.

- 1 - queue logs (`__qLog`, a debugging aid, off by default)
- 2 - saved queues (`__qSaved`; the queue panel's header has it too)
- 3 - settings gear (`panel-settings`)
- 4 - auto follow-up (`__afBtn`)
- 5 - add to queue (`__qAdd`; Alt+Enter does the same)

The first fold always takes two buttons with it in practice: the "⋯" costs the
slot the first one freed.

### What counts as not fitting

The app counts any clipped box as a row that does not fit - a label ellipsized
below its max-width included. Its ladder stopped at 2, so that never cost more
than an ellipsis. Ours goes on, and by that measure a long file name in the
selection chip folded every button of ours and wrapped the row: measured with
`ConversationHistoryPanel.tsx` open, all five folded at 480px and the footer was
two lines from 460px down. So `compact` is taken on the app's word, and every rung
after it only on a real cut (`runtime/cut.js`): the row past its own box, a glyph
pushed out of a squeezed button, or a label under 4em. With the same file open the
row now stays on one line, every button showing, down to 400px.

## Anchors

All in `webview/index.js`, all resolved before anything is written:

- the ladder: `switch(<s>){case 0:return 1;case 1:return 2;case 2:return 2}` -
  `case 2` becomes `default: return __ccFold.next(<s>)`;
- the footer: from `[<M>,<P>]=<h>({stage:0,tick:0}),<j>=<M>.stage` through
  `"data-fit-stage":<j>` to `<F>("button",{type:"submit"`, the middle carried
  through verbatim;
- the "+" menu's class map, by its keys (`addButtonContainer`, `menuPopup`,
  `menuItem`, ...), never its hash.

The CSS names the footer module's classes through `$Ctx.FooterHash`, detected in
`lib/Extension.ps1`. The ladder appeared between 2.1.252 and 2.1.258; older
bundles report `[miss]` and are left untouched.

## Verified

In `tools/lab` on 2.1.280, every 5-15px from 700 down to 130px and back up, with
nothing outside the frame and no glyph squeezed at any width, the same rungs in
both directions, and no row mutation while typing or idle. Repeated at zoom 1.34
with Remote Control and the agents pill showing, and with a file selection chip.
The menu, Escape, an outside press, the settings and saved-queues dialogs and
auto follow-up's menu were each driven from the "⋯". Unit tests:
`node patches/footer-fit/tests/fold.test.js`.
