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
model: opus
effort: max
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

## `## once` - a question the panel asks at the moment it is needed

The most valuable question in a conversation is usually one that has to be asked
at a particular moment and then never again. A line in `## rules` cannot express
either half: the model decides whether this is the moment, and next turn it will
decide again.

So the responder file says *when*, as a pattern, and the panel does the deciding:

```markdown
## once
when: [0-9]+([.][0-9]+)? ?(ms|sec[a-z]*|min[a-z]*|s)([^a-z]|$)
ask: what real input was that measured on, and how many seconds does a person
  actually wait for it?

when: [0-9]+([.][0-9]+)? ?%
ask: by what FACTOR can this be cut, not by what percent - and what would have
  to stop being computed at all for that to happen?
```

Entries are `when` / `ask` pairs separated by a blank line; a line that is neither
continues the field above it, so a question can be wrapped. `when` is a JavaScript
regular expression, matched case-insensitively against Claude's message. The first
entry that matches and has not fired yet takes the turn: the panel puts that
question, records it, and never puts it again in that arming.

The ledger is keyed by the **text of the question**, not by its position. Keyed by
position, switching responder mid-session made the new one's first question count
as already asked, and so did editing the list. Keyed by content, a question you
have reworded is a question that has not been asked - which is what someone
editing the file expects.

`first_question:` in the front matter is the simple case of the same thing: asked
once, on the first armed turn, with no pattern. A responder can use either.

### What this is worth, measured

Eight moments were taken from a real project's transcripts - the turns where the
human's message is followed by the work actually changing direction - and each was
replayed four times, walking them in order so the ledger carries across them the
way it would in a working session.

The question began as the first paragraph of `## rules`, prose competing with four
other rules for attention. On the message where it mattered most it fired **3 times
out of 6**. Moved into the mechanism and gated on the first armed turn: **6 of 6** -
and that number was worth nothing, because the turn it is needed on is not turn
one. In the real session it came around turn forty, and measured there the turn
gate fired it **0 times out of 4**. Gated on the pattern instead: **4 of 4**.

That is the correction worth keeping. "It works when I try it" measured the
harness, not the responder - a turn gate can only be right if the harness hands it
turn one, and the harness did.

That is the rule this patch keeps rediscovering: whatever the mechanism can
decide, the mechanism decides. The claims ledger, the record of what was sent,
and this are all the same lesson.


### The fallback that ate the other rules

`## rules` is a list, and one entry - "an axis closed with a measurement: ask for
the next axis and what it is priced at" - matches almost any message reporting a
number. Measured over twelve turning points it was the move on seven of them,
including the one where the human wrote "by what factor can this be cut".

The fix was not a sharper wording of that rule but demoting it: it is now labelled
the last resort, with the measurement written into the rule itself, and two moves
were added that the transcripts show the human actually making - refusing a claim
that something is closed or exhausted, and asking what a reported gain costs.

Measured after: **the fallback appears in none of forty-eight samples**, against
seven of twelve moments before.

It is replaced by a new most-common move - challenging an unearned claim of
closure - which now appears on nine of twelve. That is one dominant default for
another, and worth saying plainly. The reason for preferring it is not its
frequency: it keeps pressure on the claim in front of it, where asking for the
next axis accepts the frame it was handed and moves on. In this project's own
history, the largest win came from reopening a closure statement that had been
believed for four days.

Two moments are still not what the human did. On "explain it simply, no analogies"
the responder asks for a proof: it has no move for not being understood, and that
may be right for a responder whose subject is measurement.


### The dialog edits the whole file

`## goal` and the `## once` chain had no field. They survived a save only because
`serialize` writes back what it was handed, so the dialog showed half a responder
and nothing said which half.

All four sections are on the pane now, in the order the prompt is built from them.
The two short prose sections share a row; rules and the once chain each take the
full width - one because it is what anybody actually writes in, the other because
its lines are `when` / `ask` pairs that wrap badly in half a pane. Every empty box
carries a placeholder, because an empty box with a heading says nothing about what
belongs in it.

The once chain is edited as the text of the section and parsed **in the host**, by
the same `parseOnce` the file format uses. The panel never parses it, so a pattern
that does not compile cannot reach the loop as an object nobody checked, and
`## once` means one thing in one place.

Save says whether there is anything to save. It read "Save" on an untouched draft,
so the only way to find out was to press it - which on an untouched draft is a
write nobody asked for.


## Watching it write

Clicking the lane's header opens the live view: the responder's thinking and its
output, arriving as they are written. The lane shows the finished message and the
one line of reasoning it reports; this is what it was doing on the way there,
which is the only way to tell a model that is stuck from one being careful - and
the only way to decide to stop it before it finishes.

The host runs the CLI with `--output-format stream-json
--include-partial-messages`, which prints one JSON object per line: a system
init, a `stream_event` per delta, then the same result envelope plain `json`
would have given on its own. Text arrives as `content_block_delta` with
`delta.text` and thinking as the same event with `delta.thinking` - checked
against the CLI, not the documentation.

**The deltas are for looking at and nothing else.** The result envelope is still
the only thing the loop reads, so a delta that is malformed, truncated, or
arrives after its run has ended can make the view wrong and can do nothing worse.
Buffers are kept per run id, so a late chunk from a cancelled run cannot bleed
into the next one. And the last line is still parsed exactly as before, which is
why a bundle patched before this change - or a CLI too old for stream-json -
keeps working.

**What it is actually worth, measured against the real CLI rather than the
harness.** Two runs of the shipped runner with the shipped responder: the first
delta arrived 16.2 s into an 18.1 s run and 22.2 s into a 24.3 s one, and the
whole answer was written in the second after it - four chunks, about 300
characters. So this view is mostly a wait, which is why the header carries a
clock: a wait with no number on it reads as nothing happening.

Neither run produced a single thinking delta. The pane is there because a model
that does think should be watchable, not because this responder does.

The stream is the answer and not a paraphrase of it: the streamed text is the
exact JSON the model wrote, and the message shown in the lane is parsed out of
it. A first check said otherwise and was wrong - it compared the parsed message
against raw JSON, where the quotes are still escaped.

Escape closes the view and leaves the responders dialog underneath open. It used
to close the dialog instead: that handler is registered first and stopped the
event, so the layer nobody was looking at was the one that went.

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
- **`effort`** how hard that model is asked to think - `low`, `medium`, `high`,
  `xhigh`, `max`, or `default` to pass no flag and leave the CLI's own setting
  alone. It is not the same axis as the model: a cheap model thinking hard and
  an expensive one glancing are both sensible answers to "this responder only
  has to notice a number". Measured through the real runner on one turn of
  `perf-skeptic` at sonnet: `low` answered in 125 output tokens and 8.7 s, `max`
  in 3043 and 44.5 s. The CLI does not validate the level - `--effort banana` is
  accepted in silence - so set it from the dialog rather than by hand.

## The two ledgers

**What Claude asserted** - short lines numbered by the turn that produced them.
The responder returns them in the same call that produces the message, so it
costs no extra model call, and it is deliberately not written by Claude, who is
the only participant with file tools and would otherwise keep the record of its
own claims.

**What the panel sent** - the last five follow-ups, kept by the panel from its own
send path. Nothing is asked of the responder for this, because nothing can be:
told to return the questions still open it reworded them every turn so nothing
matched, and given ids to hand back it wrote a new question instead of returning
the id. A fresh process will not keep books; it will read what is put in front of
it. Without this the responder asks the same question four times in new words and
never escalates - measured, and then measured again after the fix, where it says
"that's four times now, I'm not asking a fifth" and drops the claim as unverified.

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

## Where the transcript and the session id come from

Both from the places this repository already established, not from the session
store, and both were wrong here first:

- **The reply being answered** is read from the DOM, with the same detected class
  names `copy-message` uses: `.message_<hash>`, a user turn identified by the
  `.userMessage_<hash>` inside it, with thinking blocks and tool calls stripped.
  Nothing in this repo reads a message list off the store, and the first version
  here assumed `s.messages.value`. That is `undefined`, so `lastAssistant()`
  returned `""` on every tick and **the loop would never have fired once** -
  silently, with a green test suite, because the stub modelled the assumption.
- **The session id** comes through `window.__qAuto.sid()`, which is
  `persist.js`'s resolved and cached value. Its own note says where it really
  lives, confirmed with an in-webview probe: the webview URL carries
  `?session=<uuid>` and the store object does not carry it at all. The first
  version here read `s.sessionId` and got `""`, which would have keyed every
  conversation's arming and claims to one shared bucket.

## What survives a window reload

Everything except a run that was in flight: the arming, the turn count, the
answer waiting for approval, the stop reason, a released approval, the claims
ledger and the once-ledger. They live in `localStorage` under the session id,
and `af/persist.js` writes them from the one place every state change ends -
`renderAll()` - with `tick()` as the catch-all.

**A reload gives the same conversation a new session id.** Measured in a real
editor: armed under `fbf2bf72`, `Developer: Reload Window`, the same two messages
back on screen with the title unchanged, and the panel now calling itself
`c08c5113`. Every key here is per session id, so that alone orphaned all of the
above and the button came back off with everything still on disk under the old
id. That, and not the variables, was why an auto follow-up did not survive a
reload.

So the identity that matters is the conversation, and what names it is its
opening - the first thing the user asked and the first thing Claude answered,
neither of which changes. A session that arrives with no arming of its own looks
for a stored state whose opening matches what is on screen and takes its keys
over, moving them rather than copying so there is only ever one claim on one
conversation. A different conversation on screen inherits nothing.

**The one thing that does not come back unconditionally** is the answer waiting
for approval. It was written for one message, and sending it three turns later
answers a conversation that has moved on - so it is stored with the message it
was written for and restored only while that message is still the last thing
Claude said. A run that was in flight is not restorable at all: its child belongs
to the host and answers a rid that no longer has a panel. The turn it was
answering is already in `lastSeen`, so nothing is asked twice - the cost of a
reload mid-run is that one follow-up.

Checked in a real VS Code, not only against the stub: armed, seeded with a turn
count of 7 and an answer in the lane, reloaded for real, and the panel came back
`__afBtn __afOn`, `7/20`, tooltip `Auto follow-up · perf-skeptic`, the answer
still in the lane. Then the same again with the keys moved under a dead session
id: the panel adopted them and the old keys were gone.

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

**A failure of the CLI itself is a different thing and is never sent.** The run
asks for `--output-format json`, so the CLI's own envelope carries `is_error`
beside the model's answer. Without it the CLI reports its own failures as ordinary
prose on stdout with exit code 0 - `Not logged in - Please run /login` is one -
and the prose fallback above would have typed that into the conversation as the
user's next message, while they were away, with the loop carrying on afterwards.
Note that `subtype` stays `"success"` in that case, so `is_error` is the field
that separates them. A CLI failure ends the arming with the reason on the button.

## Installing it over an already-patched bundle

This patch adds `window.__qAuto` to **prompt-queue**, and everything here gates on
it - `maybeRun` returns early when it is missing, so the feature is inert rather
than wrong. But `prompt-queue` reports `[skip] queue JS already patched` on an
install that already has it, so the export never arrives and nothing happens.

Confirmed over CDP against a live panel: `typeof window.__qAuto === "undefined"`.

Same rule as CLAUDE.md's note on re-anchored patches: restore the pristine bundles
or reinstall the extension, then re-run `apply.ps1`. Both patches have to be
re-injected, not just this one.

## Verified against a live panel

Over `tools/cdp`, against a real conversation of 524 messages:

- all five detected selectors exist with the hashes `patch.ps1` substitutes -
  `message_07S1Yg`, `userMessage_07S1Yg`, `thinking_aHyQPQ`, `toolUse_uq5aLg`,
  `toolResult_uq5aLg`
- the shipped `transcript.js` read it correctly: 82 user turns and 442 assistant
  turns split right, `lastAssistant()` returned the real last reply, and the
  thinking blocks and tool calls were stripped out of it
- the composer form exists and carries `.__qAdd`, so the button anchors where it
  is meant to
- the composer's computed direction is **ltr** even in a Hebrew conversation, so
  the button sits left of the add-to-queue button as designed


### Armed in a real panel

Everything above is measured through the host runtime directly. The loop itself
was run in a patched editor under `tools/lab`, armed from the picker, against a
real session:

- The three sample responders were written to the lab's own responder folder,
  came back over the message channel, and rendered in the picker.
- One prompt was sent. When the turn ended the lane carried a generated message,
  its `why` line, and the badge - and the claims ledger held two claims from that
  answer, the once-ledger the id of the question it had spent, and the counter
  read 1/20.
- The message was the framing question, fired by its pattern, in the language of
  the conversation and tied to the number in the answer:
  "the 40 ms is on an empty `node -e ""` - that is not a real input. What real
  input was it measured on, and how many seconds does a person wait end to end?"

That run is also what found the arming being lost when a session gets its id.
Nothing short of a live panel could have: every unit test starts from a session
that already has one.

### A narrow panel

The panel docks at any width, and at 340px this dialog was unusable: the rail held
its fixed 224px, the edit pane - which carries `min-width:0` so a long description
can truncate - collapsed to about sixty pixels, every field was cut mid-word, and
the panel grew a horizontal scrollbar.

Below 640px the two columns become one. The rail moves above the pane and caps its
own height, and every row that pairs two things stacks them instead. Measured at
340px: no section box overlaps another, none collapses, and the dialog is 326px
inside a 340px viewport. The one pixel of horizontal overflow that remains is the
app's own `body_aqhumA`, present with the dialog closed.

`tests/panel/` holds the three checks that need a real panel, and says how to run
them.

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
