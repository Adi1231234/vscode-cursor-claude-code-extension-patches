# Project guide (for contributors and agents)

Patches for the Claude Code VS Code / Cursor extension. Each patch edits the
bundled, minified `extension.js` / `webview/index.js` / `webview/index.css`
in place. Read this before changing anything so the structure stays clean.

## Layout

- **`install.ps1`** - one-line bootstrap: downloads the repo zip, runs `apply.ps1`, cleans up. Users never edit this.
- **`apply.ps1`** - orchestrator. Dot-sources `lib/*.ps1`, builds `$Ctx`, then runs each patch in the `$order` list.
- **`lib/`** - shared plumbing, one file per concern. Never put patch-specific logic here.
  - `Io.ps1` - `Read-Text` / `Write-Text` / `Add-Text` (UTF-8, no BOM). Always use these for file I/O; the bundles contain glyphs that a non-UTF-8 write mangles.
  - `Ui.ps1` - `Write-Head/Ok/Skip/Miss/Info` console helpers.
  - `Extension.ps1` - `Find-ClaudeExtension` -> the `$Ctx` object (see below).
  - `Patch.ps1` - reusable inject helpers + the shared worktree resolver.
  - `js/ccWtResolve.js` - the one copy of the `__ccWtResolve` runtime helper.
- **`patches/<name>/`** - one folder per feature or bug fix. Contains:
  - `patch.ps1` - defines a single `function Invoke-Patch { param($Ctx) ... }`.
  - `README.md` - what it does + the proven root cause.
  - optional resources: `*.css`, `queue/*.js`, `cleanup.js`.

## The `$Ctx` contract

`Find-ClaudeExtension` returns a hashtable every patch receives:
`Dir`, `Name`, `Js` (extension.js path), `WebJs` (webview/index.js path),
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

## Non-negotiable conventions

- **Guard marker.** Every patch writes a unique `/* NAME */` comment and returns early via `Write-Skip` if it is already present. This is what makes re-running safe.
- **Fail-safe.** If an anchor is missing, `Write-Miss` and return / skip that site - never write a partial or guessed edit. A missing anchor must leave the file untouched.
- **Version tolerance.** Anchor on semantic, non-minified tokens where possible; when you must match minified code, capture the minified names with regex groups (`(\w+)`) rather than hardcoding them.
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
- **Never wrap `window.acquireVsCodeApi`.** Reassigning it (to intercept the VS Code messaging api) silently breaks the whole Cursor webview - the panel renders blank. Read what you need from the session object or the webview URL (`?session=<uuid>` carries the conversation id) instead.

## Testing a change (without touching your real install)

1. Download the exact pristine version from OpenVSX, e.g.
   `https://open-vsx.org/api/Anthropic/claude-code/win32-x64/<version>/file/Anthropic.claude-code-<version>@win32-x64.vsix`
   (it is a zip; the files are under `extension/`).
2. Place them in `<tmp>/.cursor/extensions/anthropic.claude-code-<version>-win32-x64/`.
3. Run with a redirected home so nothing real is touched:
   `$env:USERPROFILE='<tmp>'; ./apply.ps1`
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
