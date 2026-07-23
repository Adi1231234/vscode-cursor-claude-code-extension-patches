# Input RTL

**Type:** feature
**Touches:** `extension.js`
**Guard marker:** `/* INPUTRTL */`

Sets `dir=auto` on the composer + mention mirror so mixed-direction input renders correctly. Injected right after the ZOOM script.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting anything.
