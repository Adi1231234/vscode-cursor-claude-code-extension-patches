# ELECTRON_RUN_AS_NODE leak

**Type:** bug fix
**Touches:** `extension.js`
**Guard marker:** `/* ELECTRONFIX */`

The extension host runs with `ELECTRON_RUN_AS_NODE=1` - in **VS Code as well as Cursor**, it is upstream behaviour, not a fork quirk. The extension re-spreads `process.env` unfiltered into every child env, leaking the flag into every subprocess the CLI spawns.

*Proof it is not Cursor-specific:* stock VS Code's own bundle branches on it (`out/bootstrap-fork.js`: `process.env.ELECTRON_RUN_AS_NODE || process.versions.electron`) and, when the ext host forks a child itself, explicitly passes `execArgv: ["-e", "delete process.env.ELECTRON_RUN_AS_NODE;require(process.argv[1])"]` (`out/vs/workbench/api/node/extensionHostProcess.js`) - i.e. upstream knows the flag is in the ext-host env and strips it for its own children. The extension's env-building sites are the ones that don't. Strips it at each construction site (each site optional). The authored replacement JS lives in `js/` (`delete-flag.js`, `env-object.js`, and the shared `spread-merge.js` used by both spread sites); `patch.ps1` holds only the search anchors + load/write - no JS inline.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting anything.
