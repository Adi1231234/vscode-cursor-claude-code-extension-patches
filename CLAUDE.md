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
  - `Patch.ps1` - reusable inject helpers + the shared worktree resolver.
  - `js/` - shared runtime JS, one copy each: `ccWtResolve.js` (the
    `__ccWtResolve` transcript-dir resolver, pulled in with
    `Add-CcWtResolveHelper`), `ccCopyText.js` (`window.__ccCopyText`) and
    `ccStore.js` (`__ccStore` / `__ccFiber`, the webview session-store finder) -
    the last two pulled into a patch's fragment list with `Get-LibJsPath`.
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
`Nonce`, `MessageInputClass`, `MentionMirrorClass`, `PvHash`.
Need another minified name? Detect it once in `Extension.ps1` and add it to `$Ctx`
- do not re-scan inside a patch.

## Adding a new patch

1. `mkdir patches/<kebab-name>`; add `patch.ps1` with `function Invoke-Patch { param($Ctx) ... }` and a short `README.md`.
2. Add `<kebab-name>` to the `$order` array in `apply.ps1`. Order matters only for the webview-script chain (`zoom` -> `input-rtl` -> `prompt-queue`) and for `worktree-title-dir` before `worktree-fork-diff` (shared helper). Everything else is independent.
3. Put any injected JS in its own `.js` file (never a PS string - see conventions below) and pull it in with the loaders:
   - `Get-InjectedJs <jsPath> @{ '__TOKEN__' = $value; ... }` - read a `.js` resource and substitute its `__TOKEN__` placeholders (literal `.Replace`). This is how zoom / input-rtl / reload-restore inject their scripts.
   - `Expand-JsTokens <string> @{ ... }` - same substitution on an already-built string (e.g. `prompt-queue`, which joins its `queue/*.js` fragments first).
4. Reuse the `lib/Patch.ps1` helpers instead of re-writing read/guard/inject/write:
   - `Add-StyleBlock $Ctx <cssPath> '<guard>' '<label>'` - append a CSS resource once.
   - `Add-ScriptAfterMarker $Ctx <script> '<guard>' '<label>' @('<anchor1>','<anchor2>')` - inject a `<script>` after an existing marker (chained webview scripts).
   - `Add-ScriptAfterRegex $Ctx <script> '<pattern>' '<guard>' '<label>'` - inject after a regex-matched tag.
   - `Add-CcWtResolveHelper $js` - prepend the shared worktree resolver once (returns new text). Use this for anything that must resolve a `<sid>.jsonl` across worktree project dirs; never paste the helper inline.
   - `Get-LibJsPath '<name>.js'` - the path to a shared runtime in `lib/js/`, to drop into a patch's ordered fragment list (see `copy-message` / `inline-code-copy` pulling in `ccCopyText.js`). Never copy a shared runtime into a patch folder.
   - `Add-WebviewMessageHook $js <hookPath>` - put a returning guard at the top of **every** chat surface's `onDidReceiveMessage` in `extension.js`, so a patch can answer messages of its own before the app's protocol switch logs them as unknown. The hook's `__WV__` / `__MSG__` / `__COMMS__` placeholders are filled for you; returns the new text, or `$null` when the shape is gone (then `Write-Miss` and write nothing). Several patches hook the same listener - what is already there is carried through, so their order does not matter (`background-tasks`, `panel-restart-button`).

## Non-negotiable conventions

- **Editor-agnostic.** Cursor and VS Code get the *same* bundles, so a patch never
  branches on the editor: no `.cursor`/`.vscode` path anywhere outside `lib/Editors.ps1`,
  and no editor name in user-visible strings ("the editor", not "Cursor"). Everything a
  patch needs about the install is already on `$Ctx`.
- **Guard marker.** Every patch writes a unique `/* NAME */` comment and returns early via `Write-Skip` if it is already present. This is what makes re-running safe.
- **Fail-safe.** If an anchor is missing, `Write-Miss` and return / skip that site - never write a partial or guessed edit. A missing anchor must leave the file untouched.
- **Version tolerance.** Anchor on semantic, non-minified tokens where possible; when you must match minified code, capture the minified names with regex groups (`(\w+)`) rather than hardcoding them. Anchor on the *shape that identifies the site*, not on whatever happened to be next to it - matching a function body's first statement breaks the moment that statement is rewritten, while the signature plus its `{` keeps working. When a site's neighbourhood grows an optional piece across versions (a cleanup call, a `.catch` tail), make it an optional group and thread it into the injected JS as a placeholder rather than forking the resource.
- **An identifier is `[\w$]`, never `\w`, and it is never written down.** Two separate facts, both measured on the pristine bundles. (1) The name mangler changed in **2.1.245**: `$` went from 0 uses as a parameter in 2.1.241 to 10,914 in 2.1.245 (15,683 in the webview bundle), and the whole alphabet moved from `r t n i e o s a` to `X J Y Q $ z W G`. `\w` is `[A-Za-z0-9_]` and cannot match `$`, so **eleven anchors across eight patches broke in that single release** - every one of them matched again the moment the class was widened. Names can also carry digits (`f0`), so `[A-Za-z]+` is not an identifier class either. (2) Even within one mangler the names are reassigned **every release** - `renameSession(e,t,r)` -> `($,J,X)` -> `($,Q,J)` with no code change between the last two - because they are allocated by global frequency, so any edit anywhere reshuffles the whole file. Anchor on what the mangler cannot touch (string literals, property names, `this.` paths, the shape of the code) and capture every identifier as `([\w$]+)`, threading it into the injected JS as a placeholder. `panel-restart-button` and `electron-run-as-node` are the worked counter-examples: they wrote `b(`, `c`, `e`, `r` into the anchor and broke hardest.
- **A captured name spliced back into a regex must go through `[regex]::Escape`.** `reload-restore` builds its second anchor from the name captured by its first. Once that name became `$`, the unescaped splice turned into an end-of-string anchor and the site silently stopped matching - a `[miss]`, not an error.
- **A re-anchored patch does not reach an already-patched install.** A multi-site patch writes its guard once *any* site matched, so an install patched before the fix reports `[skip]` and silently keeps the partial result. After changing an anchor, restore the pristine bundles (or reinstall the extension) and re-run `apply.ps1` - and say so in the PR, because everyone else's install is in the same state.
- **No JS inside a PowerShell string - ever.** Every piece of JS that gets written into a bundle - a whole `<script>`, an injected runtime, a replacement expression, even a single swapped value like `20000` or `!0` - lives in its own real, formatted `.js` file, never as a string literal in a `.ps1`. Languages do not mix in one file. Pull it in with `Get-InjectedJs` (single resource) or `Expand-JsTokens` (a pre-joined string). The `.ps1` only *locates, fills placeholders, and writes* - it never *contains* authored JS. Parameterize the JS with `__TOKEN__` placeholders (e.g. `__NONCE__`, `__PE__`) that the loader substitutes with `.Replace` (literal, never regex). For a `[regex]::Replace`, map the placeholder to the `${n}` **backref** of the capture group (see `worktree-fork-diff`, `worktree-title-dir`) - the injected bytes then stay identical while the JS still lives in the file. The **only** JS-looking text allowed in a `.ps1` is a *search anchor* (a regex used to *find* existing bundle code - e.g. `electron-run-as-node`'s `Rx` / `RxAll` values) - that is the find-mechanism, not authored runtime, and every patch has one.
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
  `patches/remote-control-chip/` is the worked example.
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
