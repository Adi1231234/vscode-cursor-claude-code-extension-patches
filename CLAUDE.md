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
    `Add-CcWtResolveHelper`) and `ccCopyText.js` (`window.__ccCopyText`, pulled
    into a patch's fragment list with `Get-LibJsPath`).
- **`patches/<name>/`** - one folder per feature or bug fix. Contains:
  - `patch.ps1` - defines a single `function Invoke-Patch { param($Ctx) ... }`.
  - `README.md` - what it does + the proven root cause.
  - optional resources: `*.css`, `queue/*.js`, `cleanup.js`.

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

## Non-negotiable conventions

- **Editor-agnostic.** Cursor and VS Code get the *same* bundles, so a patch never
  branches on the editor: no `.cursor`/`.vscode` path anywhere outside `lib/Editors.ps1`,
  and no editor name in user-visible strings ("the editor", not "Cursor"). Everything a
  patch needs about the install is already on `$Ctx`.
- **Guard marker.** Every patch writes a unique `/* NAME */` comment and returns early via `Write-Skip` if it is already present. This is what makes re-running safe.
- **Fail-safe.** If an anchor is missing, `Write-Miss` and return / skip that site - never write a partial or guessed edit. A missing anchor must leave the file untouched.
- **Version tolerance.** Anchor on semantic, non-minified tokens where possible; when you must match minified code, capture the minified names with regex groups (`(\w+)`) rather than hardcoding them. Anchor on the *shape that identifies the site*, not on whatever happened to be next to it - matching a function body's first statement breaks the moment that statement is rewritten, while the signature plus its `{` keeps working. When a site's neighbourhood grows an optional piece across versions (a cleanup call, a `.catch` tail), make it an optional group and thread it into the injected JS as a placeholder rather than forking the resource.
- **A re-anchored patch does not reach an already-patched install.** A multi-site patch writes its guard once *any* site matched, so an install patched before the fix reports `[skip]` and silently keeps the partial result. After changing an anchor, restore the pristine bundles (or reinstall the extension) and re-run `apply.ps1` - and say so in the PR, because everyone else's install is in the same state.
- **No JS inside a PowerShell string - ever.** Every piece of JS that gets written into a bundle - a whole `<script>`, an injected runtime, a replacement expression, even a single swapped value like `20000` or `!0` - lives in its own real, formatted `.js` file, never as a string literal in a `.ps1`. Languages do not mix in one file. Pull it in with `Get-InjectedJs` (single resource) or `Expand-JsTokens` (a pre-joined string). The `.ps1` only *locates, fills placeholders, and writes* - it never *contains* authored JS. Parameterize the JS with `__TOKEN__` placeholders (e.g. `__NONCE__`, `__PE__`) that the loader substitutes with `.Replace` (literal, never regex). For a `[regex]::Replace`, map the placeholder to the `${n}` **backref** of the capture group (see `worktree-fork-diff`, `worktree-title-dir`) - the injected bytes then stay identical while the JS still lives in the file. The **only** JS-looking text allowed in a `.ps1` is a *search anchor* (a regex, or a literal key used to *find* existing bundle code - e.g. `electron-run-as-node`'s `Anchor` values) - that is the find-mechanism, not authored runtime, and every patch has one.
- **The extracted `.js` obeys the same rules as any code.** Injected JS is not exempt: SRP, DRY, reusable helpers, under 150 lines (split into named fragments like `patches/prompt-queue/queue/*.js`), and **properly formatted** - real indentation and line breaks, never a minified one-liner. This includes shared runtimes in `lib/js/`.
- **No duplication.** Shared runtime JS goes in `lib/js/` and is injected via a `lib/Patch.ps1` helper. Shared PowerShell goes in `lib/`. If you copy a block twice, extract it.
- **File size.** Every file under 150 lines (hard), aim under 100. Split large injected JS into descriptively named fragments (see `patches/prompt-queue/queue/*.js`, concatenated in the explicit `$order` list in that patch's `patch.ps1` - do not rely on filename sorting).
- **UTF-8 no BOM.** Only touch files through the `lib/Io.ps1` helpers.
- **Injected webview JS lives inside a template literal - two hazards.** Scripts injected via `Add-ScriptAfterMarker`/`Add-ScriptAfterRegex` land *inside a `` `...` `` template literal* in `extension.js`. Two distinct failure modes, BOTH from the same fact, neither caught by a plain `node --check`:
  1. **No `` ` `` or `${` anywhere (even in comments)** - they *break out* of the template literal and corrupt `extension.js`. Caught by `node --check` of the **patched `extension.js`** (not the fragment).
  2. **No backslash escapes that the template literal evaluates inside strings** - `\n`, `\t`, `\r`, `\b`, `\f` become a real newline/char *before the browser sees them*, turning `join("\n")` into a broken multi-line string literal - the whole injected `<script>` then fails to parse and **nothing runs** (no error you can see). `✓`-style escapes that yield a normal glyph are fine (they're used for icons). For a real newline use `String.fromCharCode(10)`. This is invisible to `node --check` of *both* the fragment and the patched `extension.js` (both still hold the two-char `\n`); only checking the **template-literal-evaluated** script catches it: extract the injected `<script>` body and `` node -e 'eval("`"+body+"`")' `` then `node --check` the result (that is exactly what the webview executes). Make this check part of Testing for any webview-JS change.
- **The `rtl` patch flips the whole panel to `direction: rtl`.** Any UI you inject
  inherits that. Watch out for `position: absolute` + `inset-inline-end` on a
  full-width container: the element lands at the *far side of the viewport*, not
  beside its content. Prefer normal flow, and check the result under RTL - a
  browser harness over the patched `webview/index.css` shows it in seconds.
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
- **Never wrap `window.acquireVsCodeApi`.** Reassigning it (to intercept the VS Code messaging api) silently breaks the whole Cursor webview - the panel renders blank. Read what you need from the session object or the webview URL (`?session=<uuid>` carries the conversation id) instead.

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
6. **Run it for real, in a throwaway editor** - a parse-clean bundle can still
   fail to render. Both editors take an isolated profile, so nothing real is
   touched:
   `code --extensions-dir <tmp>/extensions --user-data-dir <tmp>/ud --new-window <folder>`
   (`Cursor.exe` takes the same flags). Then open the panel and read
   `<tmp>/ud/logs/**/exthost/Anthropic.claude-code/Claude VSCode.log`.
   **VS Code does not re-verify a patched extension:** its own log says
   `Extension signature verification result for anthropic.claude-code: Success`
   with the patched bundle in place - verification covers the installed VSIX, not
   the files afterwards. What *does* bite is **auto-update**: both editors replace
   the folder on an extension update and the patches go with it (hence: re-run).
