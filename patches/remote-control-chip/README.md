# remote-control-chip

Turns the Remote Control **banner** into a small **status icon in the input
footer row**, with a hover tooltip and a confirm dialog.

## The problem

While Remote Control is on, the webview renders a full-width banner directly
above the input:

> Remote Control is active · Continue here, on your phone, or at claude.ai/code ✕

It is permanent for the whole session, spans the panel, wraps to two lines in a
normal panel and four in a sidebar, and pushes the composer down. It carries one
bit of state (connecting / connected / error) and one action (disconnect) - a
footer icon's worth of UI.

## What the patch does

Two coupled edits in `webview/index.js`, plus two CSS blocks:

1. **The banner component returns `null`.** It is the component whose props are
   `{state, onClose, otherPopupsVisible}` and whose close tooltip is
   `"Disconnect Remote Control"`; a `return null;` is inserted at the top of its
   body. Nothing else about it is touched, so the surrounding
   `otherPopupsVisible` bookkeeping keeps working unchanged.
2. **A chip is rendered in the input footer**, right after the flex spacer, i.e.
   immediately before the permission-mode selector. The runtime is `runtime/*.js`,
   prepended to the bundle and concatenated in the explicit order in `patch.ps1`.

The footer component already calls the signals hook, so reading
`session.remoteControlState.value` inside our chip re-renders the footer on
every state change - no observer, no polling.

### It has to look like a footer button, not a badge

The chip wears the app's own `footerButton` and nothing else. Three things had
to be right before it stopped reading as something stuck onto the row, and all
three were measured off the live footer rather than guessed:

- **Size.** Every glyph in the row is ~10-11 units inside the 20-unit box, with
  1.0-unit strokes: `+` is 10x10, the `/` command menu is 11x11, the permission
  glyph is 10x10.7. The chip's is 9.3x10. The first version was 13 units with
  1.2-unit walls and 1.4-unit arcs, which is only ~20% bigger on paper and
  unmistakably foreign on screen.
- **The 8px of dead space.** `.inputFooterV2 .footerButton` carries
  `padding: 0 8px 0 0` for the gap between an icon and its text label. With no
  label that is pure padding: it made the button 34px wide where its neighbours
  are 26, opened a 10px hole before the next button where every other gap is
  2px, and put the icon off-centre inside the 26px hover square. `.cc-rc-chip`
  zeroes it - with the class doubled, because that app rule is (0,2,0) and a
  single class would silently lose.
- **Colour.** `.footerButton` is `--app-secondary-foreground`, but that is the
  row's *label* colour; every icon in it is drawn at the full
  `--app-primary-foreground`. At secondary the chip reads as a disabled sibling.

The one thing that does deviate is the colour, and only by state - the app's own
status tokens, never a literal, so they follow the editor theme:

- **connected** - `--app-success-foreground` (green). This is the state worth
  reading without hovering: the row is grey, so a green glyph in it says
  "connected" at a glance.
- **connecting** - the row's normal colour, pulsing.
- **error** - `--app-error-foreground`, with the message in the tooltip.

### Hover tooltip, not `title`

`data-cc-tip` + a `::after` styled like the composer's own mic tooltip (menu
colours, `.85em`, 0.3s delay, wraps, `inset-inline-end` so it mirrors under
RTL). The native `title` attribute is deliberately not set: it is slow,
unstyled, and cannot wrap.

### Click opens a dialog, in the app's own dialog style

A one-glyph status icon must never silently drop a connection, so clicking opens
a dialog. The bundle ships five dialog CSS modules in three families; the one
copied here is the family used **twice** for confirmations (the "Different
repository" and worktree-changes dialogs) rather than the outlier that hardcodes
its scrim colour and uses no spacing tokens:

- a 380px box on an `--app-modal-background` scrim, `--app-spacing-*` and
  `--corner-radius-*` throughout, `1px solid var(--app-widget-border)`,
- an `h3` title, a description carrying an inline monospace pill (theirs holds a
  repo, ours holds `claude.ai/code`),
- and a **numbered option list**, not a Cancel/Confirm button row:
  `1 Open in the browser` / `2 Disconnect` / `3 Cancel`, first row primary.

The keyboard behaviour is copied too, because it is part of the pattern: Escape
backs out, the number keys pick a row, the arrows move the selection, Enter runs
it. Option 1 is a real `<a target="_blank">` so the webview hands the url to the
browser exactly as the app's own links do; the overlay is torn down on the next
tick so removing it cannot cancel that navigation mid-dispatch. Disconnect calls
`session.toggleRemoteControl()`, which is what the banner's ✕ did, and
`/remote-control` (or `/rc`) turns it back on.

The dialog is plain DOM, not a component: the chip is a call inside the footer's
render rather than a component of our own, so there are no hooks to hold "open"
in. Its CSS re-expresses that family against the same design tokens instead of
borrowing its hashed class names - one less minified identifier to track across
versions.

## Anchors

- banner: `function \w+\({state:\w+,onClose:\w+,otherPopupsVisible:\w+})\{` with
  a lookahead for `closeTooltip:"Disconnect Remote Control"` (two components
  share that props shape - the tooltip is what picks the right one).
- footer: the footer component's signature (`{session:…,mode:…,
  availablePermissionModes:…`) through `("div",{className:X.spacer}),`. That one
  match yields the session var, the minified jsx factory and the CSS-module map,
  so none of the three is hardcoded.

Both must match or the file is left untouched: hiding the banner without the
chip would drop the status entirely.

Verified against 2.1.227 and 2.1.241 (one match each, in both bundles).

## Verified

- `apply.ps1` against a pristine 2.1.241 from OpenVSX: both sites land, `node
  --check` clean on `webview/index.js` and `extension.js`, second run reports
  `[skip]`.
- Browser harness over the patched `webview/index.css`: all four states, LTR and
  RTL, tooltip and dialog, and candidate icons dropped into a strip of the
  bundle's real `+` / `/` / bolt / arrow at 26px and at 6x, to pick the one that
  does not stand out.
- **In a live panel** (`tools/cdp/cdp.mjs`, real bundle after a real
  `Developer: Reload Window`, with Remote Control genuinely `connected`):
  the banner is gone (the input wrapper holds only the `FORM`); the chip is
  `26x26` with `padding: 0` and `rgb(204,204,204)`, byte-for-byte the box and
  colour of the `/` beside it; its glyph bbox is `9.29 x 10` against the `/`'s
  `11 x 11` and the `+`'s `10 x 10`; the gap to the next button is the row's own
  2px; there is no `title` attribute and the tooltip's `::after` carries the
  text; footer height is unchanged at `36.576px` so the composer does not move;
  and clicking opens the dialog with this session's real `claude.ai/code` URL
  and focus on **Close**. Nothing was left behind in the DOM.
