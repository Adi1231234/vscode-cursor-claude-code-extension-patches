# message-time

The app's own message time on **every** row - your prompts, Claude's text, and
each tool call and thinking block - **under** the row, **on the left**, the way
a chat app shows it, in the format the `timeFormat` setting gives.

## Root cause

Since 2.1.287 the app draws a time stamp (`[data-message-stamp]`) and renders
its stamp component on every assistant row, tool rows included. The component
then asks one predicate whether the row is a "message": a user prompt (text,
image or document) or an assistant row holding text. A row of a `tool_use` or
a `thinking` block fails it, so the component returns nothing for it - and the
same predicate guards the getter that reads the row's time.

## The fix

One early answer at the top of that predicate: an assistant row holding any
non-text block is a message too. Everything else stays the app's - the stamp,
its look, its hover with the full date, the `showMessageTimestamps` switch, and
the format.

**Folded reads.** Since 2.1.292 a run of Read calls is folded into one
synthetic row ("Successfully read N files") that the app builds with no
`createdAt`, so even with the predicate open it had no time (3 rows of 164 in
a real session). It now carries the time of the first read it folds - the
constructor call is found right after its own `Successfully read` result. A
bundle that folds nothing (2.1.280, 2.1.287) is left alone; one that folds
with a shape this does not know reports `[miss]`.

The predicate is found through the time getter, which is anchored on its shape
(`if(!<pred>(m)||m.content.some((b)=>b.isPartial)`), and both names are
captured. The same predicate also feeds the day divider (first time in a day)
and a bookmark's `writtenAt`; a tool row's time is as true there as a text row's.

## Under the row, on the left

The app puts the stamp line first in the row: absolute at the top right of a
reply row (`.inPadding`), in flow above a prompt bubble. `message-time.css`
makes it the last item of the row's flex column instead (`order: 1`), aligned
to the left in either text direction (`direction: ltr`, so the rtl patch's
right-to-left list does not push it right). What it settles along
with that, each measured off the live DOM:

- A reply row ends with its action buttons (`assistantActions_`, revealed on
  hover). Left in place they sit between the text and its time, a visible gap;
  they go after the time (`order: 2`).
- **A prompt's time sits inside its bubble**, bottom left, on the bubble's last
  line when it leaves room - chat-app style. Hung under the bubble it read as
  detached from it (the bubble is a full-width bordered box). The prompt row
  becomes a one-cell grid holding both the bubble and the time; `last baseline`
  puts the time on the line of the bubble's last line of text, and it is lifted
  above the bubble's positioned box to be painted at all. An invisible box as
  wide as the time (plus its column offset) ends the text: it stays on the last
  line when that line leaves room and wraps when it does not, so the time never
  covers a word. Measured over 9 prompts: inside the bubble 9/9, overlapping
  text 0/9, a full-width line wrapping the time onto a line of its own.
- **One column.** A reply row keeps a 30px timeline gutter on its left (the
  dot and the line, `.timelineMessage{padding-left:30px}`), a prompt row has
  none, so their times started 30px apart. The prompt's time takes the same
  30px, and every time in the transcript starts at one x - the x where a tool
  row's name ("Read", "Grep") starts. Measured: one distinct x over 207 stamps.
  Placing them all at the row's own edge instead would run every reply's time
  through the timeline line.
- **Close to its own row.** The time reaches half-way into the row's 8px bottom
  padding (`--app-spacing-small`), so it reads as the end of its row and not as
  the start of the next.

No JS: plain CSS over the app's own `data-message-stamp` and
`data-transcript-message` attributes.

## The format is a setting, not a patch

The app formats every stamp with Claude Code's `timeFormat` setting
(`~/.claude/settings.json`): `"auto"`, `"12-hour"`, `"24-hour"`,
`"24-hour-utc"`, or a strftime pattern. For 24-hour time with seconds:

    "timeFormat": "%H:%M:%S"

The panel reads it when the window starts: run `Developer: Reload Window` after
changing it (measured in the lab: a live edit is not picked up, even across a
turn).

## Checked

Real install, 2.1.292, a past session of 9 prompts: prompts 9/9, tool and
thinking rows 164/164 (the folded reads row between 00:17:26 and 00:17:31
reads 00:17:26), text 34/35 - the one without is the "Remote Control is
active" notice, which the app writes with no time at all.

Lab, 2.1.292, 2026-10-07: a turn with a thinking block, a Read and a
PowerShell call - user 1/1, tool and thinking rows 3/3, text 1/1 stamped,
reading `11:49:05` with the setting above. No runtime cost: no script, no
observer - the app renders one more small component per row.
