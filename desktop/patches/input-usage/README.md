# input-usage (desktop)

How much of the usage window is left, on a thin line at the very bottom of the
composer.

## Why

The Code app shows usage only as an icon-only button; the number lives in that
button's `aria-label` ("Usage: Weekly - all models: 60%, Resets Wed 8:00 PM")
and is never on screen. This surfaces it.

## What it does

- Reads `[aria-label^="Usage:"]`, pulls the percent, the window name and the
  reset time, and renders them as a small line with a bar at the bottom of
  `[data-cds="ChatComposer"]`.
- Colour is `color-mix(... currentColor ...)`, never a literal, so it follows
  the theme.
- Re-reads on each `__ccWatch` batch (usage changes at a turn's end, which is a
  DOM change - the Stop button leaving the send cell), writes through `__ccDom`
  so nothing is touched unless the value changed, and re-attaches itself if the
  composer remounts. Hidden on the start screen, where there is no usage button.

## Verified

Prototyped live on `claude.ai/code`: parsed "Weekly / 60% / Wed 8:00 PM" from
the real label and sat flush at the composer's bottom edge.

## Note

The source is the button's user-facing label. If its wording changes the parse
degrades gracefully (the line hides) rather than showing something wrong.
