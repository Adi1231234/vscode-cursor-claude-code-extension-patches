# ELECTRON_RUN_AS_NODE leak

**Type:** bug fix
**Touches:** `extension.js`
**Guard marker:** `/* ELECTRONFIX */`

Cursor sets `ELECTRON_RUN_AS_NODE=1` on its extension host; the extension re-spreads `process.env` unfiltered into every child env, leaking the flag into every subprocess the CLI spawns. Strips it at each construction site (each site optional).

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting anything.
