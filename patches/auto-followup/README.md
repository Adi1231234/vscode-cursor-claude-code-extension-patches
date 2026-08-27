# Auto Follow-Up

**Type:** feature
**Touches:** `extension.js` (host runtime + `__ccaf` hook) + `extension.js` (panel script) + `webview/index.css`
**Guard markers:** `/* AUTOFOLLOWUPHOST */`, `/* AUTOFOLLOWUP */`
**Depends on:** `prompt-queue` (consumes `window.__qAuto`; `apply.ps1` runs it first)

When a turn ends, a second model reads what Claude just wrote and types the next
message in your place. You write one file that says how to answer for you, arm it
with one click, and it keeps going until its stop condition is met or you press
stop.

## A responder is one file

`~/.claude/responders/<id>.md`, or `$CLAUDE_CONFIG_DIR/responders/`. **Global**:
the same list appears in every editor window and every repository, and nothing is
copied into a project. What is *armed* is per panel, so turning one on in one
window does not start it answering in all of them.

```markdown
---
name: perf-skeptic
description: Challenges measurements and keeps digging
context: last-message+claims
max_turns: 20
autosend: false
model: sonnet
---

## rules
A claim of sameness without saying how many inputs it was checked on:
    ask whether that is evidence or proof, and on how many inputs.
A number measured on a benchmark rather than the real workload:
    ask how large the real input is and how long a person waits for it.

## stop
Every item in the budget has landed, been refuted with a measurement, or been
priced and set aside.
```

The parser is forgiving on purpose. Unknown front-matter keys are preserved and
written back, and a file with no `##` headings at all still works - the whole body
becomes the rules. Three examples are written on first use and are yours to
delete; nothing recreates them.

## The four settings

- **`context`** decides what the responder is worth, and it is the one to
  understand. `full-session` lets it read Claude's reasoning, and a challenger
  that has read the argument is generally persuaded by it. `last-message+claims`
  gives it the last message plus the running ledger of what Claude has asserted,
  **without** the reasoning, so it can still catch "turn 5 said identical, turn 11
  says 3% different". `last-message` is the cheapest and the blindest.
- **`max_turns`** a number, or `unlimited` to run until the stop condition.
- **`autosend`** `false` holds the *first* message for review; releasing it lets
  the rest of that arming flow. `true` never stops.
- **`model`** which model runs the responder, through the Claude CLI.

## The claims ledger

Short lines, numbered by the turn that produced them, in `localStorage` under the
session id - the same store and the same keying the queue uses.

The responder returns them in the same call that produces the message, so the
ledger costs no extra model call. It is deliberately **not** written by Claude:
Claude is the only participant with file tools, so "have it written to a file"
means the party being checked keeps the record of its own claims and decides what
goes into it. `Export claims` writes it out when you want it, and `Clear` empties it. The
ledger belongs to the conversation and not to the arming, so turning a responder
off does not wipe it - what Claude asserted stays true across an off and on
again.

## Why a slot of its own and not a queue item

The queue already sends one message per turn, so pushing follow-ups into it looks
obvious. It fails in four ways, and two of them fail silently:

1. **`commitComposerToQueue` pauses on an idle add** (`resize-input.js`), which is
   how a batch is built. A follow-up is generated exactly when idle, so it would
   pause the queue every turn and the loop would never run.
2. **`pauseOnStop` returns early when the queue is empty** (`stop-pause.js`). The
   slot is filled *after* a turn ends, so at the moment stop is pressed there is
   nothing in `Q`, `paused` is never set, and **the stop button would not stop the
   loop**. Here the same `interrupt()` hook disarms directly, with no such
   condition.
3. **A queued item waits its turn.** A follow-up written for turn N and sent three
   turns later answers a conversation that has moved on. The slot holds one
   message, replaced every turn.
4. **The queue persists and restores held.** A follow-up is valid for one turn;
   restoring one after a reload would send a stale message into a different
   conversation. The slot is never persisted.

**Your queue always wins.** Nothing is generated or sent while items are waiting
in it, so a batch you typed is never overtaken.

## The contract

The responder answers with JSON: `message` is typed into the slot, `why` is the
grey line under it, `claims` are appended to the ledger, and `stop` is `null`
while the loop continues and carries the reason when it ends.

If the JSON fails to parse the turn is **not** dropped - the raw output becomes
the message and the line is marked invalid. A responder that answers usefully in
prose is worth more than a turn lost to a missing brace, and the log records it so
one that does this every time is visible rather than merely slow.

## Tests

    node patches/auto-followup/tests/run-all.mjs      # 120 checks

See tests/README.md. The last one is not optional for a change in `af/`: this
script is injected into a template literal, so a backslash is consumed before the
browser sees it, and neither `node --check` of the fragment nor of the patched
bundle can see that.

## What is on screen

The button left of the queue's add button is the only place the state lives,
because the queue panel is not always there: off, armed with `4/20` (or a bare
count when `unlimited`), or finished in warning colour with the stop reason on
hover. The generated message appears in a lane below a rule of its own, editable
before it goes, with the rule that produced it underneath.
