# Desktop patches (Claude Desktop, Windows)

Patches for the **Claude Desktop app**, the sibling of the VS Code / Cursor
patches one directory up. Same idea - edit the shipped, minified bundle in
place - but the app is an Electron program, not a VS Code extension, so the
injection point and the launch barrier are different. Read this before changing
anything here.

## What the app looks like on disk

Claude Desktop now ships as a **Microsoft Store / MSIX package**
(`C:\Program Files\WindowsApps\Claude_<ver>_x64__pzs8sxrjxfjjc\app`). An MSIX
package cannot be patched in place: Windows **Code Integrity Guard**
(`MicrosoftSignedOnly`) kills the process the moment it loads a modified file
from inside the package, and flips the package to "needs remediation". So we do
**not** touch the installed app at all.

Instead we keep our own **patched copy**, outside the package, which CIG does
not police:

- `%LOCALAPPDATA%\claude-code-patches\app\` - the Electron app, extracted from
  the release and patched. `claude.exe` + our `version.dll` beside it.
- `%LOCALAPPDATA%\claude-code-patches\installed.json` - the version marker
  (which release this copy was built from), so re-running is idempotent.
- `%LOCALAPPDATA%\claude-code-patches\mods\queue\` - the `/queue` phone mod,
  outside the app folder so an update does not drop it.
- `%APPDATA%\Claude\` - user data (login, settings, session list). Shared with
  the Store build, so chats and login carry over; patching never touches it.

`desktop/install-desktop.ps1` builds and refreshes that copy (see "Install and
update" below). The Store build keeps updating itself and is left alone; the
patched copy is what the "Claude (patched)" shortcut launches.

## Injection model (confirmed by experiment, not guessed)

The Code tab is the claude.ai web app loaded into a window, reached at
`https://claude.ai/epitaxy`. Our code reaches it through two files inside
`app.asar`:

- **Renderer payload** is prepended to `.vite/build/mainView.js`, the **preload
  that runs inside the Code-tab page**, so it has that page's DOM. This is where
  the queue and the other visible patches live. It runs in an isolated world
  with no access to the page's own JS, and the page carries a CSP, so desktop
  patches read state from the **DOM**, never from a React store. That is also
  why the "did Claude really finish" rule is reliable here: the composer's
  Stop/Send control only returns to Send when the whole turn (subagents and all)
  is done, so a DOM read never reports an idle state mid-turn.
- **Main payload** is prepended to the main-process entry (`package.json` `main`,
  normally `.vite/build/index.pre.js`), for anything that needs Electron main
  (OS notifications, raising a window).

`lib/asar-inject.cjs` does the in-place edit: it rebuilds the archive, prepends
the two payloads, recomputes each changed file's SHA-256 integrity record, and
leaves every other file - including the deduped shared blobs and the unpacked
native modules - exactly as it found them. `tools/roundtrip.cjs` proves that on
a real archive (623 files integrity-checked, 2 changed, 621 byte-identical, and
the archive grows only by the payload bytes).

## The launch barrier (the fingerprint step), now in `fingerprint/`

`claude.exe` stores app.asar's expected SHA-256 and refuses to launch when the
archive no longer matches - exactly what happens after we inject. The fix is a
proxy **`version.dll`** placed beside `claude.exe` (the loader searches the
exe's own folder first). Its `DllMain` recomputes the patched archive's header
hash and overwrites the expected hash **in the running process's memory only**,
so the exe's own check passes; nothing on disk changes, and every real
`version.dll` export is forwarded to the system DLL. This only works from a
normal directory, which is why we patch a copy, never the MSIX.

The source is ours (`fingerprint/src/ccfingerprint.c`, ~120 lines), built by
`fingerprint/build.ps1` (VS Build Tools). The repo also ships the prebuilt
`fingerprint/version.dll`, so installing needs no compiler.

## Install and update

One command does everything - fetch the latest release, extract its Electron
app, patch it, place the fingerprint shim, make the shortcut:

    & ([scriptblock]::Create((irm <raw>/install.ps1))) -Scope desktop

`install.ps1` takes `-Scope` (`vscode` / `desktop` / `all`; default `all`, so a
plain `irm | iex` still does both). The desktop half is `desktop/install-desktop.ps1`:
it reads `https://api.anthropic.com/api/desktop/win32/x64/msix/latest`
(`{version,url}`), and when that version differs from `installed.json` it
downloads the `.msix` (a plain ZIP), extracts its `app/` subtree into the
patched copy, runs `apply.ps1` against it, and drops in `version.dll`. Already
on the latest + patched: it does nothing.

## Scheduling (an Adi Tools task, not a Windows scheduled task)

The patched copy does not self-update (no Store identity), so an **Adi Tools
task** runs the command above on a schedule. The task's script is the one-line
bootstrap with `-Scope desktop`; its triggers (startup / login / daily) decide
how often it checks for a new release. The sibling VS Code task runs the same
bootstrap with `-Scope vscode`.

## Testing

The renderer side runs in a real Chrome against `claude.ai/code`, which renders
the same Code tab: `tools/chrome-live/run.mjs` loads the built payload into an
isolated world (as the preload runs) and answers every write request itself,
so a check can press Send and read the request without anything reaching
Claude. A Windows Sandbox cannot hold a Claude login (each boot is a new
Windows identity, so the saved login cannot be decrypted); it only proves the
inject / launch / boot path.

## Layout

- `lib/asar-container.cjs` - read an ASAR archive: header, file list, file bytes.
- `lib/asar-integrity.cjs` - Electron's SHA-256 block integrity format.
- `lib/asar-inject.cjs` - the in-place patcher (`patchAsar`).
- `lib/build.cjs` + `tools/build.cjs` - assemble the payloads: the runtime, then
  each patch in `patches/order.json`; each `.css` file becomes one
  `__ccd.style()` call; the preload's channel prefix is read out of the archive.
- `lib/js/` - the runtime loaded before every patch: `boot.js` (`__ccd.patch`,
  `__ccd.style`), `ipc.js` (the app's local-session event stream and calls),
  `rows.js` and `store.js` (one session store per conversation, of the VS Code
  panel's shape, so webview code runs unchanged) and `session.js` (which one
  is on screen). The parent's `lib/js/ccDom.js` and `ccWatch.js` come with it.
- `patches/<name>/` - one folder per feature. `renderer.json` runs a parent
  patch as is with named fragments swapped (`prompt-queue`); `renderer.order` or
  `renderer.js` is desktop-only code.
- `tools/inject-cli.cjs`, `tools/roundtrip.cjs` - inject; prove the injector safe.
- `tools/chrome-live/` - the live checks described under Testing.
- `apply.ps1` - build + inject into a given install dir (`-InstallDir`).
- `install-desktop.ps1` + `install/` - fetch the latest release, extract, patch
  the copy, place the shim, make the shortcut. `install/Msix.ps1` (fetch +
  extract `app/`), `install/Shortcut.ps1` (the launcher shortcut).
- `fingerprint/` - the `version.dll` shim: `src/ccfingerprint.c`, `build.ps1`,
  and the prebuilt `version.dll` that ships.

## Status

- [x] ASAR injector + integrity, proven on the real archive.
- [x] `message-bidi`, `input-usage`, `zoom` - verified live on claude.ai/code.
- [x] `prompt-queue` - the full VS Code queue, one per conversation, running
      off screen too; verified live on claude.ai/code (its README lists what
      was measured and what only the app can show).

- [x] `phone-queue` - `/queue` from the phone, the parent's mod unchanged;
      main side tested in Node and end to end with a real CLI, page side live
      on claude.ai/code.

- [x] The fingerprint shim (`fingerprint/version.dll`, our own source), and the
      patched copy launching with it - verified in the real app: the freshly
      extracted + patched copy boots, the shim recomputes and accepts the new
      hash, and no CIG remediation fires (it runs outside the MSIX).
- [x] One-command install / auto-update (`install.ps1 -Scope`, `install-desktop.ps1`)
      - fetch latest release, extract, patch, shim, shortcut; idempotent.

`node desktop/tools/test.mjs` runs every offline check (the build, the phone
main side); `tools/chrome-live/` holds the live ones.

Open:

- [ ] Wire the Adi Tools task (bootstrap with `-Scope desktop`, startup/login/daily).

Not applicable here:

- `mcp-reconnect-all` - the Code tab has no MCP-servers dialog (0 MCP UI found
  live); the parent patch targets the VS Code `/mcp` dialog, which this surface
  does not have. Nothing to reconnect, so there is nothing to add.
