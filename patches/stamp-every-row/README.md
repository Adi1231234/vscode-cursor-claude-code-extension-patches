# stamp-every-row

The app's own message time on **every** row of a reply - each tool call and
each thinking block - not only on your prompts and Claude's text.

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

The predicate is found through the time getter, which is anchored on its shape
(`if(!<pred>(m)||m.content.some((b)=>b.isPartial)`), and both names are
captured. The same predicate also feeds the day divider (first time in a day)
and a bookmark's `writtenAt`; a tool row's time is as true there as a text row's.

## The format is a setting, not a patch

The app formats every stamp with Claude Code's `timeFormat` setting
(`~/.claude/settings.json`): `"auto"`, `"12-hour"`, `"24-hour"`,
`"24-hour-utc"`, or a strftime pattern. For 24-hour time with seconds:

    "timeFormat": "%H:%M:%S"

The panel reads it when the window starts: run `Developer: Reload Window` after
changing it (measured in the lab: a live edit is not picked up, even across a
turn).

## Checked

Lab, 2.1.292, 2026-10-07: a turn with a thinking block, a Read and a
PowerShell call - user 1/1, tool and thinking rows 3/3, text 1/1 stamped,
reading `11:49:05` with the setting above. No runtime cost: no script, no
observer - the app renders one more small component per row.
