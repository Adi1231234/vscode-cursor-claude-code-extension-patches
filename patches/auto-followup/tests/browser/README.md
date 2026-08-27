# The browser harness

The real injected script, in a real browser, against a DOM shaped like the real
transcript.

    node patches/auto-followup/tests/browser/build.mjs
    python -m http.server 8791 --bind 127.0.0.1     # from this folder
    # open http://127.0.0.1:8791/harness.html

**Serve it, do not open the file.** `file:` URLs are unique origins, so the
`postMessage` the host bridge answers on is dropped and the responder list never
arrives - the menu comes up empty and nothing else works.

## Why it exists

Every other test drives the script against stubs written next to it, and a stub
that models the assumption rather than the app proves nothing. That is not
hypothetical here: `lastAssistant()` read `s.messages.value`, which the app does
not have, so it returned `""` on every tick and the loop could never have fired -
and 120 checks stayed green, because the stub put `messages` on the store exactly
where the code looked for it.

The class hashes in `build.mjs` were read out of a live panel over CDP, not
invented.

## What it proved

Driven over CDP, in Chrome:

- the button is inserted **immediately before `.__qAdd`**, 26x26, with its icon
  and tooltip, and asks the host for the responder list on load
- the picker opens `position: fixed` and on-screen, lists the responders from the
  host, and arming one turns the button orange (`rgb(217,119,87)`), shows `0/20`,
  and writes `ccAfArmed:<session>` to localStorage
- the dialog renders every part: the list and New, `name` and `description` as
  inputs, all four settings, **two separate prompt boxes**, and no "Open in
  editor"
- a new assistant message appended to the transcript makes the loop request a run
  on its own, and the context carries that reply **with the thinking block and the
  tool call stripped**, a claims array, and no transcript (correct for
  `last-message+claims`)
- the result renders in the lane with the `auto` badge, the why line, an editable
  body and the play button, held at "ממתין לאישור" because `autosend` is false;
  the claims land in `ccAfClaims:<session>` numbered `[1]`
- editing the message and pressing play sends **the edited text**, clears the lane
  and leaves the responder armed
- `interrupt()` **with nothing queued** disarms: the button goes to `__afDone`,
  `1 · done`, tooltip `STOP — stopped by hand`, the arming is cleared and the
  claims are kept. This is the case `pauseOnStop` cannot catch and the reason the
  lane is not a queue item.
- a CLI-level failure comes back as `STOP — Not logged in · Please run /login` on
  the button, sends nothing to Claude, and renders no lane

## fit.html - does the dialog stay inside the screen

    # served from this folder, then open http://127.0.0.1:8791/fit.html

Eight viewports crossed with four zoom levels, 32 real layouts. A row fails if
any edge of the dialog leaves the viewport, if the header is clipped, if any
footer button cannot be scrolled into view, or if the body collapses.

The trick that makes it cheap: the dialog is `position: fixed`, and **an iframe
has a viewport of whatever size it is given**. No emulation, no CDP, no editor -
just an iframe that is resized between rows, with `body.style.zoom` set inside it
the way `patches/zoom` sets it.

The zoom axis is the one that matters, and it is the one a fixed-size check would
have missed. Run against the build from before the zoom fix, 24 of the 32 rows
fail - **every row with zoom above 1, at every size from 1400x900 down to
340x620**, the header off the top and the buttons off the bottom by as much as
347px. All eight rows that pass are the zoom-1 ones. It is not the screen size.

It also found the case the zoom fix does not cover: at 510x300 under zoom 2 the
body flexed to 0 and the footer, 219px of wrapped buttons, was pushed out of a
247px dialog and clipped away. Hence the floor on the body and the dialog
scrolling as a whole - see the comment above `.__afDlgBody` in followup.css.

Two things it does not cover. The live view never opens here (it needs a run), so
that its own box is unaffected is read off the classes - it uses `__afLiveBody`,
not `__afDlgBody`, and its height is fixed - and not measured. And the probe
itself was wrong once: it scrolled to the bottom to find the footer and then read
the header, and reported ten clipped headers that were the probe scrolling them
away.

## What the browser cannot answer

Zoom. Chrome and the Electron VS Code ships disagree about what a rect means under
CSS zoom, and the dialog's own scale detection was built on that difference.
`fit.html` was 32 of 32 green while the same build hung a third of the dialog out
of a real panel. Anything about zoom is checked with `tests/panel/fit.js` in the
lab as well - see `tests/panel/README.md`.
