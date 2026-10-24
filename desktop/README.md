# Desktop patches (Claude Desktop, Windows)

Patches for the **Claude Desktop app**, the sibling of the VS Code / Cursor
patches one directory up. Same idea - edit the shipped, minified bundle in
place - but the app is an Electron program, not a VS Code extension, so the
injection point and the launch barrier are different. Read this before changing
anything here.

## What the app looks like on disk

The supported install is the **regular (per-user) installer** from
`claude.ai/download`, not the Microsoft Store / MSIX package. It lands at:

- `%LOCALAPPDATA%\AnthropicClaude\app-<version>\` - one folder per version.
- `...\app-<version>\resources\app.asar` - the archive that holds all the code.
- `...\app-<version>\claude.exe` - the launcher.
- `%APPDATA%\Claude\` - user data (login, settings, session list). Shared with
  every install type; patching never touches it.

Each update downloads a new `app-<version>` folder and the old one lingers. Our
changes live in the archive, so **every update drops them** (see "Re-apply").

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

## The launch barrier is left to Adi

`claude.exe` stores app.asar's expected hash and refuses to launch when the
archive no longer matches - exactly what happens after we inject. Making the
launcher accept the patched archive (the **fingerprint** step) is deliberately
**not implemented here**; Adi owns that piece. `apply.ps1` injects the payloads
and stops, printing that the fingerprint step is still required. For in-sandbox
testing only, a known-working `version.dll` shim is used as a launch aid; it is
never part of what ships.

## Re-apply after an update (via Adi Tools, not a new background service)

Adi Tools is the scheduler. A **watch** trigger on
`%LOCALAPPDATA%\AnthropicClaude\Squirrel-Update.log` runs our apply when a new
version is staged. It must wait for the log's `Finished Squirrel Updater` line
before patching: patching mid-update, or relaunching the app before the update
settles, leaves the app unable to start (measured). One gap to close in Adi
Tools: a watch whose path does not exist yet at startup never arms and says
nothing - not a problem once the regular install is in place, but worth fixing.

## Testing

Everything is tested in a **Windows Sandbox** kept alive across the whole build,
so login happens once. The harness installs the regular build, injects, and
relaunches the app in place; it reaches the panel over a CDP port the same way
the VS Code lab does. The renderer-side logic is also checkable in plain Chrome
against `claude.ai/code`.

## Layout

- `lib/asar-container.cjs` - read an ASAR archive: header, file list, file bytes.
- `lib/asar-integrity.cjs` - Electron's SHA-256 block integrity format.
- `lib/asar-inject.cjs` - the in-place patcher (`patchAsar`).
- `tools/roundtrip.cjs` - proof the patcher is safe and reversible.
- `apply.ps1` - locate the install, build the payloads, inject (to come).
- `patches/<name>/` - one folder per feature, mirroring the parent repo (to come).

## Status

Built and checked offline (integrity + parse on the real archive), with the DOM
anchors each one needs confirmed live on `claude.ai/code`:

- [x] ASAR injector + integrity, proven on the real archive.
- [x] `apply.ps1` + renderer bootstrap + inject CLI (reuses the parent's
      `ccDom` / `ccWatch`).
- [x] `message-bidi` - verified live (RTL decided per message).
- [x] `input-usage` - verified live (thin usage line in the composer).
- [x] `zoom` (Ctrl+wheel) - written; live check in the sandbox pass.
- [x] `prompt-queue` core - store + panel verified live (add / reorder / edit /
      remove / pause); Enter-to-enqueue and the real send are the sandbox pass.

Not done yet:

- [ ] Live sandbox pass: confirm our boot runs in the `epitaxy` preload after a
      real patched launch, and verify enqueue-interception, send, and zoom.
- [ ] `prompt-queue` advanced: schedule, saved queues, continue-after-usage-limit,
      in-panel log (pure-logic modules to port from the webview queue).
- [ ] `phone-queue`: a `/queue` CLI mod steering this queue over Remote Control
      (depends on the live queue and a mod-to-preload channel).
- [ ] Adi Tools re-apply trigger (watch `Squirrel-Update.log`, wait for
      `Finished Squirrel Updater`, then re-run `apply.ps1`).

Not applicable here:

- `mcp-reconnect-all` - the Code tab has no MCP-servers dialog (0 MCP UI found
  live); the parent patch targets the VS Code `/mcp` dialog, which this surface
  does not have. Nothing to reconnect, so there is nothing to add.
