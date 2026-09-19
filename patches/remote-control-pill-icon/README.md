# remote-control-pill-icon

Makes the Remote Control pill in the input footer row show **only its glyph**, at
every panel width, instead of the words "Remote Control".

## The problem

Upstream renders a pill in the footer row under the composer:

> 📱 Remote Control

and already has an icon-only form of it. But that form is not a breakpoint and
not a preference - it hangs off an attribute the footer sets on itself:

```css
.pill_<h>      { padding: 0 8px }
.pill_<h> svg  { display: none; width: 26px; height: 26px; margin: -4px 0 }
.pill_<h> span { text-overflow: ellipsis; overflow: hidden; white-space: nowrap }

[data-fit-stage="1"] .pill_<h>,     [data-fit-stage="2"] .pill_<h>      { padding: 0 }
[data-fit-stage="1"] .pill_<h> svg, [data-fit-stage="2"] .pill_<h> svg  { display: block }
[data-fit-stage="1"] .pill_<h> span,[data-fit-stage="2"] .pill_<h> span { display: none }
```

`data-fit-stage` is written on the footer container by the footer component
itself, from a `ResizeObserver` that re-runs a fit pass whenever the row's
content width changes (stage 0 -> 1 -> 2 as the row stops fitting; at stage 2
the model pill is dropped from the row entirely). So the glyph appeared only
while the panel was narrow enough for the row to overflow - which is exactly
what you see when you drag the panel narrow and the label turns into a phone.

## What the patch does

Applies those three stage declarations unconditionally. **Every value here is
upstream's own** - the patch chooses nothing about how the pill looks, it only
removes the width condition. A wide panel now renders what a narrow one always
did: the 26px glyph in the pill background, no label, no side padding.

CSS only. The component is not touched, so all four states (connected,
connecting, error, disconnected) keep their own colours, links, `title` and
click behaviour.

### Why this is not a specificity fight

The app's base rules are `.pill{...}` (0,1,0) and `.pill svg|span{...}` (0,1,1).
Ours are the same selectors, and this stylesheet is appended to the end of
`webview/index.css`, so they win on document order alone - no `!important`, no
doubled class. The `[data-fit-stage]` rules are (0,2,0)/(0,2,1) and still beat
ours at stage 1 and 2, which is harmless: they set the same three values.

### Accessibility

Hiding the `span` takes the text out of the accessibility tree, but every branch
of the pill already carries its own `aria-label` (`"Remote Control"` when
connected, the status sentence while connecting or on error) plus a `title`, so
the control keeps its name and its hover text. Nothing is lost by dropping the
visible label.

## Anchors

No JS anchor at all - the only thing that has to be discovered is the pill's
CSS-module hash, and that is done once in `lib/Extension.ps1` as `$Ctx.PillClass`:

```powershell
if ($wc -match 'pillLink:"pillLink_([a-zA-Z0-9]+)"') { $ctx.PillClass = "pill_$($matches[1])" }
```

anchored on `pillLink` rather than `pill`, because **three** CSS modules in the
bundle define a `pill` key (`pill_jamplw`, `pill_LBSAWQ`, `pill_lcdCYQ`) while
`pillLink` is unique to this one and carries the same hash. The hash is threaded
into the stylesheet as `__PILL__` by `Add-StyleBlock -Tokens`, so it is never
written down in a file that outlives the release that minted it.

If the module is renamed, the detection falls back to the last known value and
the rules simply match nothing - the pill keeps its label, and nothing else in
the panel changes.

## Verified

Against a pristine **2.1.278** from the install's own `.pristine` copies, patched
in a throwaway `.vscode/extensions` via `apply.ps1 -ExtensionsDir`:

- `[ok] remote-control pill icon CSS appended`, with the hash resolved to the
  real `pill_jamplw` (detected, not written down).
- The three rules land at the **end** of the stylesheet (offsets 497990-498142)
  with the app's own last pill rule at 377960, so document order settles it.
- `node --check` clean on both `extension.js` and `webview/index.js` (this patch
  touches neither, and the rest of the set still parses with it in the run).
- Invoking the patch a second time on the already-patched file reports
  `[skip] remote-control pill icon CSS already present` and leaves `index.css`
  byte-identical (528656 -> 528656).

Then in a browser over the **patched** `webview/index.css`, with the pill markup
copied from what `UH0()` emits (an `<a class="pill pillOn pillLink">` for
connected, a `<span>` for the other two branches) and only the `--app-*` theme
variables supplied by the harness - no pill rule of its own:

every one of the five cases measured the same: `padding: 0px`, `svg` at
`display: block`, `span` at `display: none`, a 26x18 pill holding a 26x26 glyph.

- **stage 0, connected** - the case this patch exists to change. Accessible name
  `Remote Control`.
- **stage 1, connected** - upstream's own narrow form, for comparison. Identical
  in every value, which is the whole claim of the patch.
- **stage 0, connecting** and **stage 0, error** - the `<span>` branches. Names
  `Connecting to claude.ai/code` and `Remote Control error: …`.
- **stage 0 under `dir="rtl"`** - unchanged, as expected for a single centred
  glyph with no inset-based positioning.

`innerText` is empty in all five (the label really is gone) while `aria-label`
survives in each branch. The 26x26 glyph deliberately overflows the 18px pill
box: that is upstream's own `margin: -4px 0`, untouched.
