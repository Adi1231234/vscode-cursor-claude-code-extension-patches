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
