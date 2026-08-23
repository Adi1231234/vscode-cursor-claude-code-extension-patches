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

The chip wears the app's own `footerButton` plus `footerButtonPrimary`
(connected) / `footerButtonInactive` (connecting), so its colour and hover come
from the same place as every other button in the row. Only the error tint and
the connecting pulse are ours. The icon is drawn to the bundle's own footer-icon
metrics - an 11-unit glyph in a 20-unit box with 1.0-unit strokes, measured off
the `/` command-menu icon. A heavier or larger glyph reads as foreign, which is
exactly what the first version got wrong.

### Hover tooltip, not `title`

`data-cc-tip` + a `::after` styled like the composer's own mic tooltip (menu
colours, `.85em`, 0.3s delay, wraps, `inset-inline-end` so it mirrors under
RTL). The native `title` attribute is deliberately not set: it is slow,
unstyled, and cannot wrap.

### Click opens a dialog

A one-glyph status icon must never silently drop a connection, so clicking opens
a confirm dialog: what Remote Control is, the `claude.ai/code` link for this
session, and **Close** / **Disconnect**. Escape and a click on the backdrop
close it; the confirm calls `session.toggleRemoteControl()`, which is what the
banner's ✕ did. `/remote-control` (or `/rc`) turns it back on.

The dialog is plain DOM, not a component: the chip is a call inside the footer's
render rather than a component of our own, so there are no hooks to hold "open"
in. Its CSS re-expresses the app's own dialog against the same design tokens
instead of borrowing its hashed class names - one less minified identifier to
track across versions.

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
  RTL, tooltip and dialog, and the icon side by side with the bundle's own `/`
  at 6x to match weight and size.
- **In a live panel** (`tools/cdp/cdp.mjs eval`, real bundle after a real
  `Developer: Reload Window`, with Remote Control genuinely `connected`):
  the banner is gone (the input wrapper holds only the `FORM`), the chip renders
  with `footerButton + footerButtonPrimary`, no `title` attribute, its `svg` box
  is `26×26` exactly like its neighbours, footer height unchanged at `36.576px`
  so the composer does not move, and clicking opens the dialog with this
  session's real `claude.ai/code` URL and focus on **Close**.
