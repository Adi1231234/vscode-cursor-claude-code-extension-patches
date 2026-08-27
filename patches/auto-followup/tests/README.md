# Tests

Plain node, no framework and no install:

    node patches/auto-followup/tests/run-all.mjs      # 120 checks, all five

Or one at a time: `host.test.js` (27), `loop.test.js` (36), `ui.test.js` (40),
`host-run.test.js` (17), and `node tools/check-injected.mjs auto-followup`.

**`host.test.js`** exercises the responder folder against a temporary
`CLAUDE_CONFIG_DIR`: seeding, the parser and its round trip, unknown front-matter
keys surviving a save, a file with no `##` headings, and that an id which could
escape the folder is refused rather than sanitised. It also drives `extract` and
`shape` over the outputs a model really produces - fenced JSON, prose then JSON,
pure prose, broken JSON, an empty stop string, junk in the claims array, and
braces inside the message.

**`ui.test.js`** renders. The button in all three states and both counter forms,
the picker with and without responders, every pane of the dialog, saving,
deleting an armed responder, and the lane in each state it can be in. These all
run inside a click handler or inside `tick()`, and `tick()` is wrapped in
try/catch - so a throw in any of them is silent and permanent rather than loud.
That is the whole reason they are tested. It also covers two races: an edit to
the armed responder reaching the counter, and a send that fails *after* a disarm
not resurrecting the slot.

**`host-run.test.js`** checks the prompt `run.js` composes - that the rules, the
stop condition and the message are all in it, that claims appear only when the
setting asks for them, that `full-session` adds the transcript, and that the
message being answered comes last. It also spawns the CLI for real with a bad
model name, to prove a failure comes back as a verdict rather than a hang.

**`loop.test.js`** runs the panel script itself against `dom-stubs.js` and drives
the whole loop: that it does not answer a reply which predates arming, that one
turn produces one run and never two, that the context carries what the responder's
`context` setting says and nothing more, that `autosend: false` holds the first
message until it is approved, that the user's queue and the user's pause each
block it, that `max_turns` and a stop reason and the stop button all end it, and
that a result addressed to another panel is ignored.

**`live.test.js`** is not in `run-all.mjs`: it spawns the real CLI and costs
tokens. It composes the prompt the panel will, runs the shipped `perf-skeptic`
over a reply that trips two of its rules, and checks that what comes back parses,
picks a rule rather than answering generically, and extracts the claims. Run it
when the contract, the samples or `run.js` change.

It deliberately does **not** redirect `CLAUDE_CONFIG_DIR`. The responders folder
lives under it, but so do the CLI's credentials, so isolating it makes every run
return `Not logged in` with `is_error` true. That cost one wrong diagnosis here -
it was read as a transient auth blip and written up as one - so the test builds
its responder from the shipped sample text instead of through the store.

**`loop-live.test.js`** is the one that tests the design rather than the
plumbing, and it is an experiment with a control. `context: last-message+claims`
exists so a responder can catch Claude contradicting itself across turns, and
nothing else here tested that: every other test feeds canned results. This runs
the real loop over a scripted five-turn conversation with the real CLI deciding
each turn, and plants a contradiction three turns after the claim it contradicts.

The control is the same conversation on `context: last-message`, which by
construction cannot see the earlier claim. **Four runs, four times the same
result:** the ledger arm connects turn 4's "3% difference" to turn 1's
"byte-identical" and asks about it; the control arm asks a reasonable question
about turn 4 alone and never reaches back. If both arms had caught it, the ledger
would not be what did the work and the setting would be decoration.

Two things it settled that were not obvious:

The ledger arm often does **not** stop where the control does. That is the ledger
working, not failing: turn 5 disposes of an item "because it changes the output",
which contradicts turn 1, so the budget is not settled and the responder says so.
It is also the concrete shape of the risk in `max_turns: unlimited` - a responder
that keeps finding contradictions has no reason to stop.

Citing the ledger by number - "in [3] you wrote ... and in [4]" - is the strongest
evidence it was read rather than merely attached, and it happens in some runs and
not others. It is printed, never asserted. A check that fails two runs in three is
worse than no check.

## One thing the stubs get right on purpose

`__ccStore()` returns the **same object** every call, because the real one caches
what it finds in the fiber tree. The stop button works by decorating that object's
`interrupt()`, so a stub that returned a fresh object each time made the stop test
fail - and the failure looked exactly like the feature being broken. It was the
stub. If a test here fails, check the stub against reality before the code.
