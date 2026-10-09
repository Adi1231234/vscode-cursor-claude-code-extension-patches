# tools/perf - do the patches slow the panel down?

Every Claude panel of an editor window shares one renderer thread, so whatever a
patch costs, every panel pays together. This measures it on the real thing, on
every push to a pull request into master, and master will not merge a request
it fails, admins included (`.github/workflows/perf.yml`; the requirement is the
branch protection's required check `perf`).

```
node tools/perf/perf.mjs                     # the version budgets.json pins
node tools/perf/perf.mjs --version latest    # the newest on OpenVSX
node tools/perf/perf.mjs --skip message-cards,message-time   # what do they cost?
node tools/perf/why.mjs --phase stream       # which code did the work
```

Needs Chrome (`CHROME_PATH` to point elsewhere) and Windows PowerShell for
`apply.ps1`. Nothing outside a temp folder is touched; the VSIX is cached in
`CC_PERF_CACHE` (default `%TEMP%\cc-perf\cache`).

## What runs

- **The real panel, in a plain headless Chrome.** The published VSIX is
  unpacked and patched by `apply.ps1 -ExtensionsDir`, which keeps every bundle's
  original beside it (`*.pristine`), so one folder serves both variants: the
  panel as published and as patched. `page.mjs` builds the page from the
  extension's own `getHtmlForWebview` template - the app's skeleton plus every
  patch's `<script>` in place - with only its slots filled.
- **A fake host** (`host/`). The panel talks to the extension through
  `acquireVsCodeApi().postMessage` and window messages; `fake-host.js` answers
  `init`, the CLI state, the session list and the session (recorded from a real
  host on 2.1.294, personal data left out), and every other request with an
  empty answer of its type.
- **A long made-up conversation** (`transcript.mjs`): 60 turns of prompts in
  Hebrew and English, thinking, Bash with output, a failing command, Read, Edit,
  Grep, markdown replies - about 350 rows. Same bytes every run.
- **Four phases per visit**, each in its own trace: *mount* (open the
  conversation), *idle* (3 s of nothing - polling shows up here), *scroll* (up
  and back, a step a frame), *stream* (a prompt typed and sent, then
  `host/turn.js` streams a working turn: thinking, 25 commands, a reply a few
  words at a time - the frames are the ones the CLI sends, recorded in the lab).
- **Pristine and patched alternate**, a warm-up visit each first, then
  `rounds` visits each; the report shows medians. One more visit each with
  Blink's selector stats on.

## The numbers

On the page renderer's main thread: `busyMs` (top-level tasks - what you wait
on), `longestTaskMs` (the longest freeze), `styleMs` / `layoutMs` / `paintMs` /
`scriptMs`, `styleElements` (elements whose style was recomputed), `recalcs`,
`forced` / `forcedInline` (style or layout a script forced; inline = a patch's
own `<script>`).

`budgets.json` limits each one as `[ratio, slack]`: patched may be at most
`pristine * ratio + slack`; a `null` ratio caps patched outright. Counters
(`styleElements`, `recalcs`, `forcedInline`) are the same run to run and carry
tight limits; times swing with the machine and carry loose ones - they are
there to catch a freeze, not a millisecond.

Selectors: a rule only the patched stylesheet has, that gets past Blink's
ancestor filter on more than `maxAttemptRatio` of the elements styled while the
conversation opens, is one Blink could not file under a class, id or tag. It
fails the run by name.

## When it fails

`why.mjs` runs one patched visit with Blink's invalidation tracking on for a
phase and names the code: what scheduled each style pass (attribute, class,
`:has`, and the JS stack), which elements were restyled and why, forced layouts
by caller, and JS self time by patch (a frame in an inline `<script>` belongs to
the patch whose guard comment opens it; one in `index.js` is the app's or a
patch spliced into the bundle - the nearest guard is a hint only).
`--skip <patches>` leaves patches out, `--drop <regex>` takes matching rules out
of the live sheet first, `--dump <file>` keeps the raw trace. Rules dropped
after the page loaded leave the flags they already set on elements - see the
`.turn + .turn` story below - so `--skip` is the honest bisection.

If a change is meant to cost more, raise its budget in the same PR and say why
there. When the patches move to a newer extension, bump `version`.

## What it has caught (2.1.294)

- The first `message-cards` read a height, wrote a mark, read the next: 188
  forced style passes in one task, a 1.2-2.0 s freeze opening a conversation.
- 48 `[class*="x_"]` rules were 40% of all selector matching, and every class
  change anywhere re-checked every element that has a class. Every app class is
  now named exactly (`{{key}}`, `lib/CssModules.ps1`).
- `.turn + .turn` marked the conversation's container as affected by sibling
  rules, so each new turn re-checked the whole conversation against every
  sibling rule in the stylesheet, the app's own `div + div` among them - 5,000
  elements restyled per prompt. `:not(:nth-child(1 of .turn))` says the same
  without it.

## Limits

Chrome, not the editor's Electron - the same Blink, newer. The conversation is
made up, the host is fake (anything that only happens with a live CLI, a real
editor or several panels is not here), and host-side patch code (`host/`) is not
measured at all. A panel in a window with 20 others is the lab's job
(`tools/lab`).
