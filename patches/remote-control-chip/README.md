# remote-control-chip

Turns the Remote Control **banner** into a small **status icon in the input
footer row**.

## The problem

While Remote Control is on, the webview renders a full-width banner directly
above the input:

> Remote Control is active · Continue here, on your phone, or at claude.ai/code ✕

It is permanent for the whole session, spans the panel, wraps to two lines in a
narrow sidebar, and pushes the input down. It carries one bit of state
(connecting / connected / error) and one action (disconnect) - a footer icon's
worth of UI.

## What the patch does

Two coupled edits in `webview/index.js`, plus a CSS block:

1. **The banner component returns `null`.** It is the component whose props are
   `{state, onClose, otherPopupsVisible}` and whose close tooltip is
   `"Disconnect Remote Control"`; a `return null;` is inserted at the top of its
   body. Nothing else about it is touched, so the surrounding
   `otherPopupsVisible` bookkeeping keeps working unchanged.
2. **A chip is rendered in the input footer**, right after the flex spacer, i.e.
   immediately before the permission-mode selector. The runtime is
   `__ccRcChip(jsx, session, css)` in `chip.js`, prepended to the bundle.

The footer component already calls the signals hook, so reading
`session.remoteControlState.value` inside our chip re-renders the footer on
every state change - no observer, no polling.

States (colour only; the icon is a phone):

- `connecting` - secondary colour, pulsing
- `connected` - accent (clay orange)
- `error` - `--app-error-foreground`, tooltip carries the message

Clicking calls `session.toggleRemoteControl()` - exactly what the banner's ✕
did. The `claude.ai/code` link is not lost: `toggleRemoteControl()` already
inserts a chat message containing it when the session connects, and
`/remote-control` (or `/rc`) turns it back on.

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
- The two anchors match **exactly once** in 2.1.227 and 2.1.241 - and the second
  one yields `nu`/`e` there and `qd`/`e` here, i.e. nothing minified is assumed.
- **In a live panel** (`tools/cdp/cdp.mjs eval`, chip built from this folder's
  `chip.js` and CSS against the real stylesheet and the real footer):
  footer height `36.576px` before **and** after, so the composer does not move;
  chip `34×26` like its neighbours; colours `#c6613f` / secondary / error
  resolved from the theme; the click reached `toggleRemoteControl()`. The DOM was
  put back afterwards (`removed: 4, left: 0`).

## Styling

`remote-control-chip.css` only sets the state colour - the chip reuses the app's
own `.footerButton` class (passed in from the CSS-module map at runtime) for
layout, hover and the `svg { height: 1em }` sizing, so it matches the other
footer buttons at any zoom level and needs no RTL handling of its own.
