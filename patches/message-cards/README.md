# message-cards

Every action in its own place, as one card. The transcript keeps the order and
the content it has today - your prompt, each of Claude's steps with its command
and output, the reply - and only how each piece looks changes:

- **A command is a card**: a 1px `--app-widget-border` frame, 12px inside on
  every side. Its header is one line: the tool's icon, its name, **8px**, then
  Claude's description (which wraps under itself, two lines at most), and a
  **badge** on the right: a check and how long it took (`12s`, `1m 26s`), a
  cross and `exit 1` / `failed`, or a spinner and `running`.
- **IN and OUT are one terminal block** on `--app-tool-background`: no labels,
  no rule between them, the command muted after a `$` (shell tools), its output
  8px under it. Whole lines, wrapped, clamped to 2 + 4; where a clamp really
  hides something the last line fades and **Show all** appears.
- **Every item ends in one line**: what you can do with it at one end, when it
  happened at the other. A card: `Show all` (or the app's own "8 lines of
  output") left, its time right. A reply: its time left, the app's Copy and
  Bookmark right. Your prompt: your time left, the actions (rewind / fork and
  copy-message's Copy) right.
- **Claude's times on hover only, yours always** - message-time's rule, kept.
- **No timeline rail and no dots.** Status is the badge's icon *and* word
  (WCAG 1.4.1); the 30px gutter they needed goes back to the content.
- **One spacing scale** (4px base; the app's `--app-spacing-*` are its first
  four steps), each gap named by what it separates: 32 request to request, 16
  your prompt to the reply and prose to a card, 12 card to card (a card holds
  12 inside, and inside never exceeds outside), 8 a thinking line to the card
  it led to and a header to its block, 4 a block to its last line.
- Commands read **left to right** in the RTL panel; Hebrew prose stays RTL.

The design was chosen on 2026-10-08 against an exact reproduction of today's
panel on a real transcript; the three redesigns before it were rejected as too
far from today. The review page lives outside the repo.

## How

Almost all of it is CSS over what the app and the other patches already draw
(`css/*.css`, four guarded blocks), so it lays out in the same frame as the
app's own render. Hash-free: class substrings (`[class*="toolSummary_"]`) and
the app's attributes (`data-testid`, `data-transcript-message`,
`data-message-stamp`, the row's `aria-label`, which names the tool and picks
its icon). It runs after `message-time` and `copy-message` and wins their rules
by coming later at the same weight, never with `!important`.

Two things CSS cannot do are `cards/*.js` (one script, after copy-message's):

- **The badge's word.** The store keeps both rows: the call's `createdAt` and
  the result's (a later row whose block names the call's `tool_use_id`) -
  measured on 2.1.292. Their difference is the duration; a failed result's
  `Exit code N` gives `exit N`. It includes any wait for your approval: the
  store has no separate run time (the block's `startTime` / `endTime` time the
  model streaming the call, not the command).
- **Show all**, shown only where a clamp really cuts: measured
  (`scrollHeight > clientHeight`) when a row changes and on resize.

Both are absolute inside their row, so arriving a frame after the app adds no
height, and both are `overflow-anchor: none`. One observer (`__ccWatch`), one
pass per frame over the rows a mutation touched, no timer.

## Checked (lab, 2.1.292, 2026-10-08)

- A real 163-row session: Bash, PowerShell, Grep, Read, Edit (diff), Write,
  MCP tools, a failed tool, thinking, replies, prompts. Badges read `12s`,
  `11s`, `5s` on the three Bash calls of one turn; the failed one `failed`.
- Hover, with a real mouse: a card shows its time right of `Show all`; a reply
  its time left of Copy / Bookmark; a prompt its actions on its time's line.
- A live run: the badge read `running` with the spinner, then its duration;
  the list stayed pinned to the bottom the whole time (largest gap 0 over 250
  samples).
- A 426px panel. `node --check` of the template-evaluated script; the webview
  runtime check (no `setInterval`, one observer).

## Known limits

- The folded "Read N files" row has no message uuid, so its badge is the check
  alone.
- A running command's badge says `running` without a clock.
- An Edit's diff editor and a Write's file keep the app's own body.
