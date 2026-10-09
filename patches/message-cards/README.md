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
app's own render. Every app class is named exactly, `.{{toolSummary}}`, and
filled in from the bundle's own CSS-module maps (`lib/CssModules.ps1`); a key
that resolves to no class or to several writes nothing. A row's kind is read off
the row: a command row is the one carrying a status class (the app sets
`dotSuccess` / `dotFailure` / `dotProgress` exactly when the row holds a tool
call), a thinking row is the one labelled `Claude, thinking`, and the
`aria-label` names the tool and picks its icon. It runs after `message-time`
and `copy-message` and wins their rules by coming later at the same weight,
never with `!important`.

Two things CSS cannot do are `cards/*.js` (one script, after copy-message's):

- **The badge's word.** The store keeps both rows: the call's `createdAt` and
  the result's (a later row whose block names the call's `tool_use_id`) -
  measured on 2.1.292. Their difference is the duration; a failed result's
  `Exit code N` gives `exit N`. It includes any wait for your approval: the
  store has no separate run time (the block's `startTime` / `endTime` time the
  model streaming the call, not the command).
- **Show all**, made only for a row whose clamp really cuts: measured
  (`scrollHeight > clientHeight`) when a row changes and on resize. Every node
  put into a row makes Blink re-check the app's `:has()` rules on it, and most
  commands print a few lines that fit.

Both are absolute inside their row, so arriving a frame after the app adds no
height, and both are `overflow-anchor: none`. One observer (`__ccWatch`), one
pass per frame over the rows a mutation touched, no timer. The pass reads
everything first (the store, every clamp) and only then writes.

## Why exact classes, no :has() on a row, and one read before the writes

The first version (PR #128) froze every panel. Opening a long conversation in
the lab (324 rows, 172 commands, 2.1.294) held the panel's thread for 1.2-2.0 s
in one task, against 0.4-0.6 s without the patch, and all panels of a window
share that thread. Three causes, each measured with a trace:

1. **Measure, write, measure.** Show all read one block's height, wrote its
   mark, read the next: each write made the next read lay the panel out again.
   188 forced style passes in one task, 1.4 s of it.
2. **`:has()` on the row.** "Is this a command row" was
   `[data-testid="assistant-message"]:has(> [class*="toolUse_"])`, in 7 rules.
   It made each of those passes ~8 ms and a full style pass at open ~4x (230 ->
   1,040 ms). Dropping only those 7 rules took it back to 260-480 ms.
3. **Substring classes.** Blink files a rule under the class, id or tag its
   last part names. `[class*="toolSummary_"]` names none, so it is tried on
   every element of the panel on every style pass: our 48 such rules were 40%
   of all selector matching (Blink's selector stats over a scroll / stream
   run). An exact class is tried only on the elements that carry it.

After the fix, in the same lab: opening busy 0.63-0.68 s, longest task
0.35-0.42 s (no patch: 0.60-0.86 / 0.39-0.59; first version: 1.8-2.7 /
1.2-2.0); style work over a scroll + arriving rows + streaming run 0.23-0.29 s
(no patch 0.20-0.25, first version 1.18-1.31). Every row laid out to the same
tenth of a pixel as the first version, all 324 of them.

A fourth cause showed up only once `tools/perf` streamed a real turn: **`.turn
+ .turn`** (the 32px between requests) marked the conversation's container as
affected by sibling rules, so each new turn re-checked the whole conversation
against every sibling rule in the stylesheet - the app's own `div + div` among
them - and restyled ~5,000 elements per prompt. `:not(:nth-child(1 of .turn))`
says "every turn but the first" without it. Streaming a 25-command turn, the
patched panel then restyles 5,800 elements where the first version restyled
40,500 (the published panel: 3,000), and its longest task is 46 ms (first
version 163 ms). Measured by `tools/perf`, which fails a push that goes back.

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
- Again after the performance fix (2.1.294, 2026-10-09): the same geometry on
  every row, Show all opening and closing, and a live Bash run going from
  `running` with the spinner to `13s` with the list pinned (gap 0).

## Known limits

- The folded "Read N files" row has no message uuid, so its badge is the check
  alone.
- A running command's badge says `running` without a clock.
- An Edit's diff editor and a Write's file keep the app's own body.
- A row whose only call is a server-side tool (`server_tool_use`) gets no
  status class from the app, so it keeps the app's own look.
