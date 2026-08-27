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

# `model-e2e.mjs` - does the model picked in the dialog decide who answers

    node patches/auto-followup/tests/e2e/model-e2e.mjs [opus|sonnet|haiku]

Nothing shorter can answer it. The unit tests know the field is written; the
runner test knows an argv is built. Neither says the value a person clicked is
the value the CLI was given, and none of them says the CLI paid any attention.

So the real dropdown is opened and an option clicked, Save is pressed, every
message the panel posts is carried to the real host, and the run that follows is
a real spawn. The answer is the CLI's own: every assistant event carries
`message.model`.

    opus    -> claude-opus-5
    sonnet  -> claude-sonnet-5
    haiku   -> claude-haiku-4-5-20251001

**The control.** Take the `--model` push out of `run.js` and ask for haiku: the
CLI answers `claude-opus-5`, this account's default, and 2 of the 11 checks fail.
That is also the answer to "is the setting doing anything at all" - without it,
everything runs on the default.

A model name the CLI does not know is refused, not quietly swapped: `--model
gpt-4` comes back as *There's an issue with the selected model (gpt-4)*, so a
hand-edited file cannot leave someone believing a run used a model it did not.

The setting is read from disk on every run (`handle.js` reads the store by id
when the run message arrives), so changing it applies to the next turn with no
re-arming: armed on sonnet, first run `--model sonnet`, the file changed to haiku
with nothing said to the panel, second run `--model haiku`.

## Two traps, both of which read as a broken feature

The store writes real files, so it is pointed at a temporary `CLAUDE_CONFIG_DIR`
- and `run.js` hands the child `process.env`. The CLI then finds no credentials
and answers in about a second with a `<synthetic>` message. It looks exactly like
a model ignoring `--model`. The spawn wrapper puts the real config back for the
child; the isolation is for the responder file only.

And the second run in a two-turn probe does not happen if the first answer is
still sitting in the lane: `autosend: false` means the panel waits for approval
before it will run again. Approve it first. An earlier version did not, got no
second run at all, and that read as the change being ignored.
