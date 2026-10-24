# Sandbox test harness (dev only, never shipped)

Runs the patched Claude Desktop app inside a Windows Sandbox so the queue can be
driven against real conversations - including Remote Control ones - without
touching the app Adi works in. `apply.ps1` and the shipped build never use any
of this; `build.cjs` builds the real payloads, `build-sandbox.cjs` adds the
probe on top for the sandbox only.

## How the login gets in

A Windows Sandbox is a fresh Windows user each boot, so the app's saved login
(encrypted with the host user's DPAPI key) can't be opened there. The fix,
proven from the Chromium/Electron source and Microsoft's DPAPI docs: the app
keeps one random key in `Local State` (`os_crypt.encrypted_key`, DPAPI-wrapped)
that unlocks everything else. The host unwraps it (same user, so DPAPI allows
it) into the shared folder; the sandbox's LogonCommand re-wraps it with the
sandbox user's DPAPI and drops it into a copied profile. The app then opens the
login with no sign-in. Pieces: `ccd.wsb` (the config), `scripts/logon.ps1` (the
re-wrap and launch), the host-side copy+unwrap in the session that creates the
sandbox.

## The launch barrier

The app refuses to run a modified `app.asar` (hash in `claude.exe`). In the
sandbox only, lugia19's `version.dll` shim is placed beside the exe - it loads
first and tells the exe the current hash is fine. It is Adi's call for the real
machine (the fingerprint step) and never ships. Built from source
(`ClaudeDLL/dllmain.cpp` in that repo) with the VS Build Tools.

## Driving it

The probe (`probe-renderer.js` + `probe-main.js`, added only by
`build-sandbox.cjs`) watches `C:\ccd\out\cmd.json` and runs actions in the real
Code tab (`probe-actions.js`: queue commands, click, type, hook, stop), writing
the queue and store state to `C:\ccd\out\probe.json`. `act.sh` (in the build
scratch) writes a command and prints the result. `wsb exec` runs the restart /
inspect scripts without rebooting the sandbox.

## What it proved

Against a real Remote Control conversation in the app: the queue sends one
item per turn waiting for each to truly finish, the per-conversation WebSocket
(`remote-sub.js`) feeds the store so busy / stop / usage-limit / replies are
read there, and a Stop mid-turn parks the queue and holds the rest.
