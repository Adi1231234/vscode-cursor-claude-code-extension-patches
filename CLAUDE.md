# Project guide (for contributors and agents)

Patches for the Claude Code VS Code / Cursor extension. Each patch edits the
bundled, minified `extension.js` / `webview/index.js` / `webview/index.css`
in place. Read this before changing anything so the structure stays clean.

## Layout

- **`install.ps1`** - one-line bootstrap: downloads the repo zip, runs `apply.ps1`, cleans up. Users never edit this.
- **`apply.ps1`** - orchestrator. Dot-sources `lib/*.ps1`, finds every install (one `$Ctx` each), then runs each patch in the `$order` list against each of them. `-ExtensionsDir <dir>` patches one specific dir instead of auto-discovering.
- **`lib/`** - shared plumbing, one file per concern. Never put patch-specific logic here.
  - `Io.ps1` - `Read-Text` / `Write-Text` / `Add-Text` (UTF-8, no BOM). Always use these for file I/O; the bundles contain glyphs that a non-UTF-8 write mangles.
  - `Ui.ps1` - `Write-Head/Ok/Skip/Miss/Info` console helpers.
  - `Editors.ps1` - the table of supported editors and where each keeps its extensions (`.cursor`, `.vscode`, `.vscode-insiders`, `.vscode-oss`). The only place that knows about editors; add an editor = add a row.
  - `Extension.ps1` - `Find-ClaudeExtension` (one dir) / `Find-ClaudeExtensions` (every editor) -> the `$Ctx` object (see below).
  - `Patch.ps1` - reusable inject helpers.
  - `js/` - shared runtime JS, one copy each: `ccCopyText.js`
    (`window.__ccCopyText`), `ccStore.js` (`__ccStore` / `__ccFiber`, the webview
    session-store finder), `ccRow.js` (`window.__ccRow`, the relative order
    injected footer buttons agree on) and `ccModal.js` (`window.__ccModal`, the
    dialog chrome - overlay, head, foot, Esc, backdrop, focus trap) - each pulled
    into a patch's fragment list with `Get-LibJsPath`.
  - `css/` - the shared stylesheets, `Get-LibCssPath`: `ccScroll.css` (the
    scrollbar) and `ccModal.css` (the dialog chrome that goes with
    `lib/js/ccModal.js`). Whichever patch runs first appends them; the guard in
    the file makes the rest a no-op.
- **`patches/<name>/`** - one folder per feature or bug fix. Contains:
  - `patch.ps1` - defines a single `function Invoke-Patch { param($Ctx) ... }`.
  - `README.md` - what it does + the proven root cause.
  - optional resources: `*.css`, `queue/*.js`, `cleanup.js`.
- **`tools/`** - developer tooling, not shipped to users and never touched by
  `apply.ps1`.
  - `tools/lab/` - **the way to check a patch for real.** `node tools/lab/lab.mjs up`
    builds a throwaway editor running the patched bundle, with the panel open and a
    debugger attached; then `repatch` + `eval` are the edit-and-look loop. `up`
    opens the panel wide, so add `--width 300` (or `lab.mjs width 300`) whenever the
    behaviour depends on panel width - most edge-placed UI only breaks there. Read
    its README before doing any of that by hand.
  - `tools/cdp/` - drives the Claude panel of a *running* editor over a CDP port
    (see the CDP section below). The lab is built on it.

## The `$Ctx` contract

`Find-ClaudeExtension` returns a hashtable every patch receives:
`Editor` (display name, e.g. `Cursor` / `VS Code`), `Dir`, `Name`, `Version`,
`Js` (extension.js path), `WebJs` (webview/index.js path),
`Css` (webview/index.css path), plus detected minified identifiers
`Nonce`, `MessageInputClass`, `MentionMirrorClass`, `PvHash`, `PillClass`.
Need another minified name? Detect it once in `Extension.ps1` and add it to `$Ctx`
- do not re-scan inside a patch.

## Adding a new patch

1. `mkdir patches/<kebab-name>`; add `patch.ps1` with `function Invoke-Patch { param($Ctx) ... }` and a short `README.md`.
2. Add `<kebab-name>` to the `$order` array in `apply.ps1`. Order matters only for the webview-script chain (`zoom` -> `input-rtl` -> `prompt-queue`); everything else is independent.
3. Put any injected JS in its own `.js` file (never a PS string - see conventions below) and pull it in with the loaders:
   - `Get-InjectedJs <jsPath> @{ '__TOKEN__' = $value; ... }` - read a `.js` resource and substitute its `__TOKEN__` placeholders (literal `.Replace`). This is how zoom / input-rtl / reload-restore inject their scripts.
   - `Expand-JsTokens <string> @{ ... }` - same substitution on an already-built string (e.g. `prompt-queue`, which joins its `queue/*.js` fragments first).
4. Reuse the `lib/Patch.ps1` helpers instead of re-writing read/guard/inject/write:
   - `Add-StyleBlock $Ctx <cssPath> '<guard>' '<label>' [@{ '__TOKEN__' = … }]` -
     append a CSS resource once. The optional token table expands the same
     `__TOKEN__` placeholders a `.js` resource gets, for a stylesheet that has to
     name a hashed CSS-module class (see `remote-control-pill-icon`): detect the
     hash in `Extension.ps1` and thread it in, never write it down.
   - `Add-ScriptAfterMarker $Ctx <script> '<guard>' '<label>' @('<anchor1>','<anchor2>')` - inject a `<script>` after an existing marker (chained webview scripts).
   - `Add-ScriptAfterRegex $Ctx <script> '<pattern>' '<guard>' '<label>'` - inject after a regex-matched tag.
   - `Get-LibJsPath '<name>.js'` - the path to a shared runtime in `lib/js/`, to drop into a patch's ordered fragment list (see `copy-message` / `inline-code-copy` pulling in `ccCopyText.js`). Never copy a shared runtime into a patch folder.
   - `Add-WebviewMessageHook $js <hookPath>` - put a returning guard at the top of **every** chat surface's `onDidReceiveMessage` in `extension.js`, so a patch can answer messages of its own before the app's protocol switch logs them as unknown. The hook's `__WV__` / `__MSG__` / `__COMMS__` placeholders are filled for you; returns the new text, or `$null` when the shape is gone (then `Write-Miss` and write nothing). Several patches hook the same listener - what is already there is carried through, so their order does not matter (`background-tasks`, `panel-restart-button`).

## Non-negotiable conventions

- **Editor-agnostic.** Cursor and VS Code get the *same* bundles, so a patch never
  branches on the editor: no `.cursor`/`.vscode` path anywhere outside `lib/Editors.ps1`,
  and no editor name in user-visible strings ("the editor", not "Cursor"). Everything a
  patch needs about the install is already on `$Ctx`.
- **Guard marker.** Every patch writes a unique `/* NAME */` comment and returns early via `Write-Skip` if it is already present. This is what makes re-running safe.
- **Fail-safe.** If an anchor is missing, `Write-Miss` and return / skip that site - never write a partial or guessed edit. A missing anchor must leave the file untouched.
- **Version tolerance.** Anchor on semantic, non-minified tokens where possible; when you must match minified code, capture the minified names with regex groups (`(\w+)`) rather than hardcoding them. Anchor on the *shape that identifies the site*, not on whatever happened to be next to it - matching a function body's first statement breaks the moment that statement is rewritten, while the signature plus its `{` keeps working. When a site's neighbourhood grows an optional piece across versions (a cleanup call, a `.catch` tail), make it an optional group and thread it into the injected JS as a placeholder rather than forking the resource. **When an injection point has two identifying ends, match only those and *capture* what lies between**, re-emitting it verbatim: `bidi-mark-strip` spelled the middle out (`function <fn>(<arg>){if(typeof <arg>==="string")return <arg>.replace(<rx>,`), upstream factored that recursion into a generic deep-map helper in **2.1.269**, and the patch went `[miss]` for eleven releases while the panel printed `‎` again. Matching only `var <rx>=/[...]/g;` and the `.replace(<rx>,` that consumes it lands on both shapes.
- **An identifier is `[\w$]`, never `\w`, and it is never written down.** Two separate facts, both measured on the pristine bundles. (1) The name mangler changed in **2.1.245**: `$` went from 0 uses as a parameter in 2.1.241 to 10,914 in 2.1.245 (15,683 in the webview bundle), and the whole alphabet moved from `r t n i e o s a` to `X J Y Q $ z W G`. `\w` is `[A-Za-z0-9_]` and cannot match `$`, so **eleven anchors across eight patches broke in that single release** - every one of them matched again the moment the class was widened. Names can also carry digits (`f0`), so `[A-Za-z]+` is not an identifier class either. (2) Even within one mangler the names are reassigned **every release** - `renameSession(e,t,r)` -> `($,J,X)` -> `($,Q,J)` with no code change between the last two - because they are allocated by global frequency, so any edit anywhere reshuffles the whole file. Anchor on what the mangler cannot touch (string literals, property names, `this.` paths, the shape of the code) and capture every identifier as `([\w$]+)`, threading it into the injected JS as a placeholder. `panel-restart-button` and `electron-run-as-node` are the worked counter-examples: they wrote `b(`, `c`, `e`, `r` into the anchor and broke hardest.
- **A captured name spliced back into a regex must go through `[regex]::Escape`.** `reload-restore` builds its second anchor from the name captured by its first. Once that name became `$`, the unescaped splice turned into an end-of-string anchor and the site silently stopped matching - a `[miss]`, not an error.
- **A re-anchored patch does not reach an already-patched install.** A multi-site patch writes its guard once *any* site matched, so an install patched before the fix reports `[skip]` and silently keeps the partial result. After changing an anchor, restore the pristine bundles (or reinstall the extension) and re-run `apply.ps1` - and say so in the PR, because everyone else's install is in the same state.
- **No JS inside a PowerShell string - ever.** Every piece of JS that gets written into a bundle - a whole `<script>`, an injected runtime, a replacement expression, even a single swapped value like `20000` or `!0` - lives in its own real, formatted `.js` file, never as a string literal in a `.ps1`. Languages do not mix in one file. Pull it in with `Get-InjectedJs` (single resource) or `Expand-JsTokens` (a pre-joined string). The `.ps1` only *locates, fills placeholders, and writes* - it never *contains* authored JS. Parameterize the JS with `__TOKEN__` placeholders (e.g. `__NONCE__`, `__PE__`) that the loader substitutes with `.Replace` (literal, never regex). For a `[regex]::Replace`, map the placeholder to the `${n}` **backref** of the capture group (see `panel-settings`, `reload-restore`) - the injected bytes then stay identical while the JS still lives in the file. The **only** JS-looking text allowed in a `.ps1` is a *search anchor* (a regex used to *find* existing bundle code - e.g. `electron-run-as-node`'s `Rx` / `RxAll` values) - that is the find-mechanism, not authored runtime, and every patch has one.
- **The extracted `.js` obeys the same rules as any code.** Injected JS is not exempt: SRP, DRY, reusable helpers, under 150 lines (split into named fragments like `patches/prompt-queue/queue/*.js`), and **properly formatted** - real indentation and line breaks, never a minified one-liner. This includes shared runtimes in `lib/js/`.
- **No duplication.** Shared runtime JS goes in `lib/js/` and is injected via a `lib/Patch.ps1` helper. Shared PowerShell goes in `lib/`. If you copy a block twice, extract it.
- **File size.** Every file under 150 lines (hard), aim under 100. Split large injected JS into descriptively named fragments (see `patches/prompt-queue/queue/*.js`, concatenated in the explicit `$order` list in that patch's `patch.ps1` - do not rely on filename sorting).
- **UTF-8 no BOM.** Only touch files through the `lib/Io.ps1` helpers.
- **Injected webview JS lives inside a template literal - two hazards.** Scripts injected via `Add-ScriptAfterMarker`/`Add-ScriptAfterRegex` land *inside a `` `...` `` template literal* in `extension.js`. Two distinct failure modes, BOTH from the same fact, neither caught by a plain `node --check`:
  1. **No `` ` `` or `${` anywhere (even in comments)** - they *break out* of the template literal and corrupt `extension.js`. Caught by `node --check` of the **patched `extension.js`** (not the fragment).
  2. **No backslash at all, beyond a \u escape** - the literal evaluates every escape *before the browser sees the script*. \n / \t / \r become real newlines and break the string they sit in; \d, \w, \. in a regex silently lose the backslash and change what the pattern matches; a lone backslash in a string is a syntax error. A \u escape is the one exception (it yields a normal glyph, and the icons rely on it). For a newline use `String.fromCharCode(10)`, for a backslash `String.fromCharCode(92)`, and write regexes with character classes (`[0-9]`, `[.]`) rather than escapes. Grep the fragment for backslashes before shipping. This is invisible to `node --check` of *both* the fragment and the patched `extension.js` (both still hold the two-char `\n`); only checking the **template-literal-evaluated** script catches it: extract the injected `<script>` body and `` node -e 'eval("`"+body+"`")' `` then `node --check` the result (that is exactly what the webview executes). Make this check part of Testing for any webview-JS change.
- **The `zoom` patch puts the panel in a second coordinate system.** `patches/zoom`
  sets `document.body.style.zoom`, and CSS `zoom` deliberately does not scale
  viewport units. Measured across zoom 1 / 1.25 / 1.34 / 1.5 / 2 at a fixed panel
  width: `window.innerWidth`, `document.documentElement.clientWidth`,
  `visualViewport.width` and `vw`/`vh` all keep reporting the **unzoomed** viewport,
  while `document.body.clientWidth` and every `getBoundingClientRect()` come back
  at exactly `1/zoom` of it. So any code that subtracts one from the other, or caps
  a size with `100vw` and positions it from a rect, is off by the zoom factor - and
  a `position: fixed` box just gets clipped by the viewport, with no ellipsis and no
  scrollbar. That is `patches/history-dialog-clip` (read its README); the app has 7
  more `100vw`, 4 `100vh` and 5 JS viewport reads that are exposed the same way.
  Measure the viewport as `document.body.getBoundingClientRect().width` when the
  number will meet a rect.
- **Injected UI copies the app's design line - measured, never chosen.** Anything
  we add to the panel has to be indistinguishable from what the app draws itself.
  Find the app's own element that plays the same role and take its values off the
  **live DOM**, not off the source: `getComputedStyle` on the real siblings and
  `svg.getBBox()` on their glyphs settle size, colour and spacing in one call and
  catch rules a source read misses. Use the app's custom properties (`--app-*`),
  never a literal colour - a hex breaks on the next theme. When the app disagrees
  with itself, copy **the family that appears more than once** (the bundle ships
  five dialog modules; the outlier had a hardcoded scrim and no spacing tokens).
  Copy the *interaction* too: its confirm dialogs are a numbered option list
  driven by Escape / digits / arrows / Enter, not a Cancel+Confirm button row.
  And mind specificity when overriding an app rule - `.inputFooterV2 .footerButton`
  is (0,2,0) and beats a single class of ours whatever the order; double our own
  class instead of reaching for `!important` or hardcoding a hashed name.
  `patches/panel-settings/` is the worked example (the retired
  `remote-control-chip` was the first one, and `git log` still has it). Three
  things measured off the live DOM that a source read will not tell you, and that
  `patches/prompt-queue/queue/modal.css` now depends on. (1) The app has a real
  token set - `--app-spacing-small/medium/large/xlarge` = 4/8/12/16,
  `--corner-radius-small/medium/large` = 4/6/8, `--app-list-item-padding: 4px 8px`
  with `--app-list-gap: 2px` and `--app-list-hover/active-background`,
  `--app-modal-background: #000000bf` for a scrim - so a hand-picked 6px radius
  or an `rgba(128,128,128,.16)` hover is a value nobody chose. (2) Its dialogs
  and its menu popup carry **a 1px border and no shadow**; a drop shadow is the
  loudest thing you can add to this panel. (3) `--app-input-background` and
  `--app-primary-background` are **the same colour** (#191a1b). The app's own
  fields are unbordered because they sit on `--app-menu-background`; put one on
  a dialog surface with no border and it is invisible - it reads as a heading,
  which is exactly what the saved-queues name field did until it was measured.
  The app's own command menu is the reference for any list you inject: 13px
  rows, `4px 8px` padding, 2px gaps, 4px radius, an 11.7px section header.
  Copy its *metrics*, not its 50% opacity on secondary text - that lands near
  3.4:1, and `--app-secondary-foreground` gets you 5.4:1 for free.
- **Before drawing a control, check the app does not already ship it.** It has a
  real **toggle switch** of its own (a 32x18 track at radius 9 going from
  `--app-input-border` to `--app-accent-color`, a 14x14 thumb in
  `--app-primary-foreground` moving `left: 2px -> 16px`, both `.15s`, and *no*
  hover/focus/active state - the row carries those). It is what upstream puts on
  "Focus view" and "Thinking". Reproduce those values against the tokens rather
  than borrowing the hashed class, and note where preferences actually live: the
  app has **no settings dialog**, it registers each one as a command-menu action
  in a `"Settings"` section with the switch as `trailingComponent`. The one
  dialog that does hold preferences is Memory/Instructions, and its group is the
  shape to copy - a hairline `--app-widget-border` box at radius 4, rows at
  `8px 12px` divided by 1px with none after the last, the description stacked
  under the label. `patches/panel-settings/` is the worked example.
- **`footerButtonInactive` does not exist** (checked on 2.1.278 and still true on
  2.1.280: the footer module defines `footerButton`, `footerButtonPrimary`,
  `footerButtonStatic` only). The retired `remote-control-chip` read it anyway,
  so its off state rendered `class="footerButton_… undefined cc-rc-chip"` - the
  exact CSS-module-miss failure this file warns about two bullets down, shipped
  for months because nobody read the class back off the live module map. Do that
  before using any of them.
- **An icon-only button in the footer row needs `flex-shrink: 0`.**
  `.footerButton` carries `flex-shrink: 1; min-width: 0`, which is right for the
  buttons it was written for - they hold a text label and are meant to ellipsize
  as the row fills. A glyph has nothing to give: measured at a 300px panel, an
  injected 26px button was squeezed to 18px with its 26px svg painting past its
  own box. The app's own icon buttons never shrink because they set no
  min-width, so their glyph is their floor; an injected one has to say so.
- **The footer row has a second, JS-driven size axis: `data-fit-stage`.** The
  footer writes `0` / `1` / `2` on its own container from a `ResizeObserver` as
  the row stops fitting, and rules hang off it - that is how the Remote Control
  pill drops its label and becomes a glyph, and how the model pill is dropped
  entirely at stage 2. It is not a media query and will not show up in a search
  for one. `patches/remote-control-pill-icon/` just lifts that pill's stage-1
  declarations out of the condition.
- **The `rtl` patch flips the whole panel to `direction: rtl`.** Any UI you inject
  inherits that. Watch out for `position: absolute` + `inset-inline-end` on a
  full-width container: the element lands at the *far side of the viewport*, not
  beside its content. Prefer normal flow, and check the result under RTL - a
  browser harness over the patched `webview/index.css` shows it in seconds.
- **Text direction is decided per *message*, never per line, and never with a
  bidi control character.** Two facts behind that. (1) The webview ships a
  Trojan-Source mitigation: it replaces every U+061C / U+200E / U+200F /
  U+202A-202E / U+2066-2069 in message content with the literal text `\uXXXX`, so
  an RLM inserted to force a direction is *printed*, not applied.
  `patches/bidi-mark-strip/` stops the printing - it drops the three implicit marks
  (ALM / LRM / RLM) before that pass and leaves the reordering characters escaped -
  but a mark still never *applies*, so it is no more usable than before. (2) A per-block
  heuristic - the app's own `unicode-bidi:plaintext`, or any letter/word vote of
  our own - flips a Hebrew line the moment one English word outweighs it. The
  standards say to declare the direction once where it is known (HTML calls the
  first-strong heuristic "very crude" and reserves it for text "truly unknown";
  W3C `qa-html-dir` says declare at the root and override a block only on "rare
  occasions"). `patches/message-bidi/` is that declaration - read its README
  before touching direction anywhere.
- **Build the test harness from the markup the app *emits*, not from what the
  source looks like it emits.** A CSS-module lookup that has no matching key
  (`lu.messageHovered` where `lu` never defines it) renders as the literal
  string `undefined` in `class`, so a selector written from reading the JSX
  silently matches nothing. Grep the module map for the key before keying off
  it, and mirror the exact `class` attribute in the harness.
- **UI injected into the message list must add no height.** The chat pins
  itself to the bottom with `stuck = scrollHeight - scrollTop - clientHeight <
  50`, then sets `scrollTop = scrollHeight` in a layout effect. Anything a
  `MutationObserver` adds lands a frame later, i.e. *after* that scroll: the
  view ends up that many pixels off the bottom, the app never notices, and the
  next update re-pins and swallows the gap in one jump. Cancel the contribution
  (a negative margin equal to the box, or take it out of flow) and verify by
  measuring `scrollHeight - scrollTop - clientHeight` both after the app's frame
  and after your own pass - it must stay ~0 in both.
- **...and it must not be a scroll anchor: `overflow-anchor: none`.** Same site,
  the other axis, and it bites even when the height is already cancelled. The
  app keys every content block by `hash + lastModifiedTime` (`class jp`,
  `get key()`), so a streaming reply is **unmounted and re-mounted on every
  chunk**; a fresh mount is attached with `appendChild`, i.e. *after* any node
  of ours already sitting at the end of that child list. For one frame our node
  is above the whole reply body, and our own pass puts it back the frame after.
  Chromium picks it as the scroll anchor and, holding it visually still, moves
  `scrollTop` up by the height of the body it leapt over. While the transcript
  is pinned this is invisible (the app re-pins straight after); past the 50px
  the user is left where the adjustment put them - a jump to the end of the
  previous message on the first scroll away from the bottom. The declaration
  covers descendants, so put it on the node we own, not on its glyph. It shows
  up nowhere else: anchoring adjustments fire **no scroll event** and leave no
  JS stack, so read `scrollTop` inside an instrumented setter on the container
  and compare with `scrollHeight - clientHeight` (healthy is one chunk of
  growth, ~20px; broken is the whole message height).
- **Every Claude panel in a window shares one webview origin, so localStorage is
  shared - across panels and across sessions.** Measured with two panels open
  side by side: both reported `vscode-webview://0c8i409p...` and both read the
  same key, while each still held its own per-session queue. So a key that
  carries a session id is private to that conversation and a key that does not
  is visible to all of them, with no host round-trip - that is what makes
  `patches/prompt-queue/saved/` (a queue saved here, loaded in the next chat)
  possible. It survives a real window reload too, which is how the queue's own
  per-session persistence has always worked.
- **Never wrap `window.acquireVsCodeApi`.** Reassigning it (to intercept the VS Code messaging api) silently breaks the whole Cursor webview - the panel renders blank. Read what you need from the session object or the webview URL (`?session=<uuid>` carries the conversation id) instead.
- **A patch's two halves do not load at the same moment, and the host half is
  the one that goes stale.** `webview/index.js` is read when a panel opens, so
  the panel runs what the last `apply.ps1` wrote. `extension.js` is loaded
  **once, when that window's extension host starts**, and only a real
  `Developer: Reload Window` replaces it - so a window left open across an
  `apply.ps1` run can show a control whose behaviour lives in code that window
  has never loaded. Measured on 2026-09-23: a window on the `2026-09-22T08:43Z`
  host raised a Claude-finished toast on every run while its own "Stay quiet
  while this window is focused" switch was on, because the gate is applied in
  the host and arrived hours after that host did - and the switch is a shared
  `localStorage` key, so it read as on in every window. Ask the panel which host
  is behind it (`window.__ccBuild` from `auto-followup`'s stamp says `running` /
  `onDisk` / `stale`), and for anything a user can *toggle*, have the host
  **answer** its messages so the panel can feature-detect it and say so
  (`patches/panel-settings`: `done` -> `{op:"decided",shown,focused}`, `ping` ->
  `{op:"pong"}`, a warning box in the dialog when nothing comes back). A version
  compare would not have helped: what matters is whether that code is behind
  this panel.
- **One panel can be reloaded on its own, and that restarts its CLI too.**
  Re-assigning `webview.html` (rebuilt by the host's own `getHtmlForWebview`,
  which mints a fresh nonce every call, so the string always differs) re-runs
  `webview/index.js` from scratch in that view alone. The booting client then
  sends `init` with **no `channelId`**, which is upstream's own "the client
  reloaded" signal: the `init` case closes every channel that comms object
  still holds, because the webview comms class sets
  `clientInitImpliesFreshClient = true`. So the `claude` process behind that
  panel is torn down and relaunched resuming the same session id - reconnecting
  is upstream behaviour to trigger, never something to reimplement. That is
  `patches/panel-restart-button`; measured in a live editor, the clicked panel
  got a new document and a new channel while its neighbours kept theirs, and
  exactly one `claude.exe` was left running.
- **An OS notification has to leave the editor, and only the host can send it.**
  Upstream already has a `show_notification` request the webview calls in a
  dozen places - message, severity, buttons, even an `onlyIfNotVisible` gate -
  but it ends at `vscode.window.showInformationMessage`, drawn *inside* the
  window you are not looking at. There is nothing to turn on instead: the CLI's
  `preferredNotifChannel` only offers terminal escape-sequence channels
  (`iterm2`, `kitty`, `ghostty`, `terminal_bell`), all inert here, and the only
  completion signals in the bundle are the tab icon swapping to
  `claude-logo-done.svg` and the sidebar badge. For a real Action Center toast
  the host has to shell out to PowerShell (WinRT is unreachable from Node here
  without a native module). Three things that keep that clean, all in
  `patches/panel-settings/host/`: the PowerShell stays a real `.ps1` and is
  base64'd into the injected JS at patch time and run with `-EncodedCommand`, so
  no language is embedded in another and there is no command line to quote
  wrong; every dynamic value travels in the **environment** and is XML-escaped
  in the script, so no conversation title can break the toast or inject into it;
  and the toast wears the running editor's own name and icon **without the patch
  branching on the editor**, because both publish a `win32AppUserModelId` in the
  `product.json` beside `vscode.env.appRoot`. Toasts can be read back for a test
  with `ToastNotificationManager.History.GetHistory(<appId>)`.
- **To raise a specific editor window from outside, go through the editor's
  COMMAND LINE, not its uri.** `Code.exe "<folder>"` focuses the window already
  holding that folder, asks nothing, and shows no console because the editor is
  a windowed app. Everything else costs something, all measured:
  - `SetForegroundWindow` from a background process returns **false** - Windows
    refuses a caller that did not receive the last input.
  - The editor's uri (`scheme://file/<folder>/`) *does* focus the right window,
    but every `file:` uri from an external app first raises **"An external
    application wants to open ..."** - `shouldBlockOpenable`, whose only switch
    is the user's `security.promptForLocalFileProtocolHandling`. That prompt
    lives in `handleProtocolUrl`; **the CLI never goes near it**.
  - Its uri is also fussy in two ways worth knowing if you ever use it:
    `getWindowOpenableFromProtocolUrl` passes `gotoLineMode`, so a path is a
    *file* unless it ends in `/` (`if (e.charCodeAt(e.length-1) !== 47)`) -
    without the slash you open a tab, and a folder without one lands in an
    **empty new window**. And an extension authority
    (`vscode://Anthropic.claude-code/...`) cannot do this at all: it is handled
    *inside* whichever window the uri is routed to.
  - A toast click cannot run code of ours for free either - the BurntToast
    author's own write-up says PowerShell cannot subscribe to a toast's WinRT
    events before **7.1**, and every published recipe registers a custom scheme
    pointing at a `.cmd` or a `powershell`, both of which **flash a console**.
  So the click runs a **shortcut** (target: the editor binary, argument: the
  window's folder), which needs no registry, no settings and no parsing at
  click time. `patches/panel-settings/host/toast.ps1` writes it under
  `%LOCALAPPDATA%\claude-code-patches\focus\`, one per folder, outside the
  extension so an update does not take it with it. Measured with five windows
  open and the setting removed: clicking the toast moved the foreground to the
  right window, window count unchanged, nothing opened inside it, no prompt and
  no console.
- **"Is this editor window focused?" is a host question, never a panel one.**
  There is exactly one extension host per window, so `vscode.window.state.focused`
  in it *is* the answer, with nothing to match up. The panel cannot stand in for
  it: it is an out-of-process iframe, so `document.hasFocus()` is about the panel
  and reads false whenever the caret is in the editor beside it. A setting that
  depends on focus therefore lives in the panel but is *applied* in the host -
  send it along with the message (`patches/panel-settings` sends
  `skipWhenFocused`). Fail open when focus cannot be read: a notification nobody
  needed beats a silence somebody was relying on. **A lab window reports itself
  focused**, which is the opposite of what its own desktop object suggests: it
  is the only window on that desktop, so Windows hands it the focus there and
  `state.focused` is `true` even though nothing is on your screen. Measured by
  the one experiment that separates the two branches - same run twice, one bit
  changed: with the setting on, no toast; with it off, `Claude finished |
  Pineapple`. So the lab tests the *quiet* branch, and the notifying branch has
  to be tested by loading the host module in Node with `require` shadowed
  (`patches/panel-settings/tests/notify.test.js`).
- **`session.busy` is the run-state signal, and it is subscribable.** `busy` is
  set true once on the SDK's `system`/`init` frame and false only in the store's
  own `endTurn()` on the `result` frame, so it does **not** flap between tool
  calls and one rising-then-falling pair is one run. Signals carry
  `.subscribe()`, so the edge is a push - do not add a poll loop for it (the
  queue and auto-followup poll because they need a *settled reply*, which is a
  different question). Two traps: `.subscribe()` fires immediately with the
  **current** value, so the first callback must only prime the edge detector or
  opening a panel mid-run reads as a finish; and **Stop is indistinguishable
  from a finish** on this signal, so decorate the store's `interrupt()` - which
  runs synchronously with the click, before the signal flips - the way
  `prompt-queue`, `auto-followup` and `panel-settings` all do. The store object
  is replaced when the conversation changes, so re-wire from a render that takes
  `session` as a prop rather than once at load. And "is more work lined up behind
  this run?" has an answer already published: the queue exports `window.__qAuto`
  with `count()` (parked items already excluded), `paused()` and `add()` - read
  that rather than reaching into the queue's own state, the way `auto-followup`
  and `panel-settings` both do. Treat a **paused** queue as nothing pending: it
  will not send anything, so the run that just ended was the last one.
- **A feature that is silent by design has to say why it was silent.** When
  nothing happens there is no way to tell from the outside whether it decided to
  stay quiet or never saw the event at all - one run in testing raised no toast
  and could not be explained afterwards, because nothing had been written down.
  The queue patch owns the only in-panel log (`Ctrl+Alt+L` opens the viewer,
  `window.__ccLogs()` reads the ring programmatically), and it now hands the
  writer out as `window.__ccLog(tag, ...)`, so any patch can leave a trace under
  its own tag instead of borrowing `__qAuto.log` and being filed as
  "autofollowup". Log the *decision*, not just the event, and where the decision
  is taken somewhere else - `panel-settings` sends the message but the **host**
  applies the focus gate - say so in the line, or a reader chasing a silence
  reads `sent` and concludes the message was lost.

## Testing a change (without touching your real install)

1. Download the exact pristine version from OpenVSX, e.g.
   `https://open-vsx.org/api/Anthropic/claude-code/win32-x64/<version>/file/Anthropic.claude-code-<version>@win32-x64.vsix`
   (it is a zip; the files are under `extension/`).
2. Place them in `<tmp>/.cursor/extensions/anthropic.claude-code-<version>-win32-x64/`
   (and/or `<tmp>/.vscode/extensions/...` - discovery patches every editor it finds).
3. Run with a redirected home so nothing real is touched:
   `$env:USERPROFILE='<tmp>'; ./apply.ps1`
   (or point it at one dir: `./apply.ps1 -ExtensionsDir '<tmp>/.vscode/extensions'`)
4. Verify: `node --check` on the patched `extension.js` and `webview/index.js`,
   confirm the guard markers landed, then re-run `apply.ps1` and confirm every
   patch reports `[skip]` (idempotency).
5. **For any webview-JS change, also check the template-literal-evaluated form**
   (what the browser actually runs, see conventions hazard #2): extract the
   injected `<script>` body from the patched `extension.js`, evaluate it as a
   template literal, and `node --check` the result:
   ```
   node -e 'const fs=require("fs"),d=fs.readFileSync("extension.js","utf8"),
     q=d.indexOf("/* QUEUE */"),g=d.indexOf(">",d.lastIndexOf("<script",q)),
     c=d.indexOf("</"+"script>",q),u="NONCE";
     fs.writeFileSync("_eval.js",eval("`"+d.slice(g+1,c)+"`"))' && node --check _eval.js
   ```
   A plain `node --check` passes on the two-char `\n`; only this catches the
   real newline that breaks the served script.
6. **Run it for real** - a parse-clean bundle can still fail to render. Do not
   assemble a throwaway editor by hand; `node tools/lab/lab.mjs up` does the
   whole thing (pristine VSIX -> `apply.ps1` -> editor -> panel open -> a CDP
   port), and `repatch` + `eval` are then the edit-and-look loop. It exists
   because every step of that has a trap that fails **silently** - workspace
   trust, `extensions.json`, where `argv.json` is read from, occluded windows.
   `tools/lab/README.md` lists them; do not re-derive them.
   Two facts about the real install still worth knowing:
   **VS Code does not re-verify a patched extension** - its own log says
   `Extension signature verification result for anthropic.claude-code: Success`
   with the patched bundle in place, because verification covers the installed
   VSIX, not the files afterwards. What *does* bite is **auto-update**: both
   editors replace the folder on an extension update and the patches go with it
   (hence: re-run).

## Attaching a real debugger to the webview (CDP)

`Developer: Open Webview Developer Tools` is enough for a quick look. For scripted
inspection (evaluate in the page, read the DOM, drive it from a CDP client), open a
Chrome DevTools Protocol port:

**Reach for CDP, not for desktop automation.** Anything you need from a running
editor - what the panel rendered, which window owns which webview, the console, a
command, a reload - goes through `tools/cdp/` or a direct CDP call. Do **not** drive
the editor with screenshot / click / type MCPs (`adi-tools` and friends): they see
pixels instead of the DOM, act on whatever window happens to be in front, need the
window focused and visible, and leave no evidence anyone can re-check. CDP answers
with the actual DOM, addresses a window by name, works on an occluded window, and
every step is a script that can be re-run. Screenshots are for showing a human what
something looks like - never as the way to find out what the panel is doing.

- **VS Code: put it in `argv.json`** (`Preferences: Configure Runtime Arguments`,
  i.e. `~/.vscode/argv.json`). `main.js` allowlists `remote-debugging-port` next to
  `disable-hardware-acceleration`, and calls `appendSwitch` **only for a string
  value**: `"remote-debugging-port": "9333"` opens the port, unquoted `9333` is
  silently ignored. This is the only way to get the port on the *normal* profile,
  with no `--user-data-dir` and no flags to remember.
- **It is read once, when the main process starts.** The editor is single-instance,
  so closing one window and reopening it just rejoins the process that is already
  running and nothing changes. The port appears only after every window is closed
  and the editor starts cold.
- **Cursor does not support this** - its argv.json allowlist has only the four base
  switches. There, pass `--remote-debugging-port=<n>` on the command line, and only
  with no instance already running: a second launch hands its args to the running
  instance and exits, so its port answers CDP for about a second and then dies. A
  single probe sees that as success.
- `http://127.0.0.1:<n>/json/list` then lists one `page` per window (titled by
  `window.title`) plus one `iframe` per webview, tagged
  `extensionId=Anthropic.claude-code`. That iframe is the webview *shell*
  (`vscode-webview://.../index.html`, one `<script>`, empty body) - the panel's own
  DOM is one frame deeper.
- **Port open but zero targets = a pending editor update**, not a CDP problem. While
  the `vscode-updating` mutex is held (`new_Code.exe` + `updating_version` in the
  install dir), a new instance waits 30s and dies with `Code is currently being
  updated`. Chromium has already bound the port by then, so `/json/version` answers
  while no renderer exists and `Target.getTargets` returns `[]`.
- **Do not hand-roll a client - use `tools/cdp/`** (`cdp.mjs list` / `cdp.mjs eval
  <window> <script.js>`, no dependencies). It runs a script *inside the panel* of a
  named window, so `document` is the panel's document and `new MouseEvent(...)` is
  built in the right realm. Its README carries the rules for driving a live editor
  safely (`Alt+Enter` parks the queue so nothing is sent, put the DOM back, do not
  clobber the clipboard). For a *test* editor rather than your own, `tools/lab/`
  starts one already patched and already attached.
- **Keyboard-driven steps need a page that is visible and not holding focus
  somewhere useless.** Both failures look identical - the palette simply does not
  open - and neither raises anything. Windows occlusion marks a covered window
  `visibilityState: "hidden"` and Chromium then delivers it no input at all
  (`--disable-features=CalculateNativeWinOcclusion` at launch); and a fresh
  profile opens a modal *"Sign in to use GitHub Copilot"* whose button holds
  focus, from where `Ctrl+Shift+P` arrives, trusted, and does nothing (the lab
  turns that dialog off with `workbench.welcomePage.experimentalOnboarding`, and
  `palette.mjs` blurs to the body as a backstop). A key event that the page's own
  listener sees is *not* proof the keybinding fired.
- **A webview iframe is out-of-process, which breaks the two obvious ways to find
  it.** `Page.getFrameTree` on a *window* target does not list its webviews at all.
  Screen geometry (an OOPIF reports its top-level window's `screenX`/`screenY`)
  does group them, but silently mislabels every window stacked in the same place.
  What is exact: the window's own DOM still holds the `<iframe>` **element**, and
  its `src` carries the same `?id=<uuid>` as the webview target's url.
- **After patching a bundle under a running editor, only a real `Developer: Reload
  Window` picks it up.** A renderer-level reload (`Page.reload`, the
  `vscode:reloadWindow` channel, Ctrl+R - all three are `webContents.reload()`)
  brings the panel back **blank**, with a `SyntaxError` blamed on `index.js` at a
  line/column that does not match the file on disk; it survives further renderer
  reloads until the real command runs. The command reaches
  `INativeHostService.reload()` -> `CodeWindow.reload()`, which rebuilds the window
  configuration. The workbench renderer exposes no command API, so the only way in
  is keystrokes: `node tools/cdp/cdp.mjs reload <window>` types the palette over
  CDP's Input domain and waits for the panel to come back.
- The port has no authentication and any local process can attach, so take the line
  back out when you are done.
