# Bypass permission mode

**Type:** feature
**Touches:** `webview/index.js`, `extension.js`
**Guard markers:** `permissionMode=...("bypassPermissions")` (webview), `/* BYPASS-INITIAL-MODE */` (host)

Makes `bypassPermissions` the mode every session starts in, instead of `default`/`auto`.

## Why two sites

Seeding the webview's `permissionMode` signal is not enough, and stopped working
outright with the auto-mode rollout. The root cause:

- The signal seed only survives until the session object is built. Every place the
  webview creates a session (`fromServer`, new session, `finalizeTeleport`) then runs
  `let n = config.value?.initialPermissionMode; if (n) session.permissionMode.value = n`,
  overwriting whatever the signal was seeded with.
- `launchClaude()` passes `this.permissionMode.value` to the host, so that overwritten
  value - not the seed - is the mode the CLI actually launches in.
- Host-side, `initialPermissionMode` comes from
  `Settings.getInitialPermissionMode()`: the `claudeCode.initialPermissionMode` user
  setting if set, otherwise the persisted `defaultPermissionMode` globalState. Auto mode
  ships a one-time `clearPersistedPermissionModeForAutoDefaultOnce()` migration and then
  writes `"auto"` back into that globalState, so on any install without an explicit
  `claudeCode.initialPermissionMode` the resolution now answers `"auto"` and the seed is
  overwritten on every single session.

So `initial-mode.js` returns `"bypassPermissions"` from `getInitialPermissionMode()`
before the persisted default is ever read, and `bypass-mode.js` keeps seeding the signal
for the window before the host config arrives.

## Requires

`"claudeCode.allowDangerouslySkipPermissions": true` in user settings. Without it the
host downgrades a bypass launch to `default` anyway (`Downgrading launch to default
mode ...: allowDangerouslySkipPermissions is off`), so the patch deliberately falls
through to stock behaviour in that case rather than pretending to work.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`).
Each site is guarded and fail-safe on its own: an already-patched install still picks up
a site that was added later, and a missing anchor skips instead of corrupting anything.
