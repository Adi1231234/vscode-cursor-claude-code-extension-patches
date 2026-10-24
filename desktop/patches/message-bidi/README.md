# message-bidi (desktop)

A Hebrew answer whose block opens with an English word rendered left to right.

## Root cause (measured on a real Code conversation)

The Code web app renders message markdown with a per-block direction guess. On
a sampled Hebrew reply, only 9 of 40 blocks got `dir="rtl"`; the other 31 were
left at the default LTR, including every Hebrew list item and every Hebrew
paragraph that happened to start with an English token (`website: 70% ...`,
`CLAUDE.md: שורה ...`). A first-strong, per-line guess is exactly what the
standards call "very crude" and what the parent repo's `patches/message-bidi`
already rejected for the webview.

## What it does

Decides direction **once per message** and applies it to the whole message:

- The unit is `[data-cds="Prose"]`, one message's rendered body.
- It counts Hebrew vs Latin letters across the block, with `code`/`pre`
  excluded from the vote, and picks `rtl` when Hebrew is present and is at least
  a third of the letters (`h >= l * 0.5`), else `ltr`.
- That one direction is written on every text block (`p`, `li`, headings,
  quotes, lists); `pre`/`code` are forced `ltr` so snippets stay readable.

## Why it is cheap and loop-free

`__ccWatch` does not observe attribute mutations, so our own `dir` writes never
feed back. We apply once at load, then re-apply only to the Prose blocks a
mutation batch actually touched (new messages, streaming chunks), via
`__ccDom.setAttr` (writes only on a real change).

## Verified

Applied live on `claude.ai/code`: all five sampled Hebrew-start-with-English
paragraphs flipped to `rtl`, the four Hebrew messages became `rtl` and the
English ones stayed `ltr`, 34 blocks corrected in one pass.
