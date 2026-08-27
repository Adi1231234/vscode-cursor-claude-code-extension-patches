# The whole chain, once

    node patches/auto-followup/tests/e2e/live-e2e.mjs

Not in `run-all.mjs`: it spawns the real CLI and costs one live model call, about
10-30 seconds.

Every other suite proves one half. `host-run.test.js` proves the runner turns the
CLI's NDJSON into deltas. `ui.test.js` proves the live view renders deltas - the
ones the test posted by hand. Neither of them says the messages one side sends
are the messages the other side understands, and that is precisely where the two
bugs were:

- the host module is `__ccAf`, and the caller reached for `__ccAfHandle`
- `handle(msg, wv)` takes the message first, and the caller passed the webview first

Both returned quietly and produced no output, which reads exactly like a model
that answered nothing.

So this one loads the real host modules, has the **panel** ask for the run (going
through `requestRun`, which sets the id the result is matched against), spawns
the real CLI, and feeds every posted message into the real panel script. Only
`postMessage` is faked.

## What it holds down

Rename the `chunk` op in `host/handle.js` and 4 of the 11 checks fail. Worth
noticing what stays green in that mutant: the result, the slot, the lane and the
turn count. The live view is a window onto the run, not a part of it - a panel
that cannot render a single delta still sends the right follow-up.

## Two things the DOM stub does that break a real spawn

`dom-stubs.js` is built for a panel with no clock. It captures `setInterval`'s
callback in `__tick` instead of running it, and runs `setTimeout`'s callback
immediately. The second one is a trap for anything that touches a real process:
`run.js` arms a timeout that kills the child, so under the stub the CLI is killed
in the same breath it is spawned - and the failure surfaces as *"the responder
returned nothing"*, a silent model rather than a killed one. Hold the real timers
before requiring the stub.

## One observation, not a check

In four real runs the CLI streamed `text` deltas only, never `thinking`. The
live view renders both and is tested on both; the plain `-p` call these runs make
just does not produce thinking blocks.
