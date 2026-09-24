# Input RTL

**Type:** feature
**Touches:** `extension.js`
**Guard marker:** `/* INPUTRTL */`

Sets `dir=auto` on the composer + mention mirror so mixed-direction input renders correctly. Injected right after the ZOOM script.

The injected script is `open.js` (the `<script>` opener and guard) + the shared `lib/js/ccDom.js` and `lib/js/ccWatch.js` + `dir.js` (`__MSGINPUT__` / `__MIRROR__` placeholders). `patch.ps1` only joins and injects them - no JS lives in the PowerShell.

`dir.js` looks only at the nodes each mutation *added*, through the shared observer (`__ccWatch`), instead of re-querying the whole document on every mutation anywhere in the panel - a streaming reply is a mutation a frame. The attribute is written once per element, only while it is missing, so the patch never wakes the other observers or the footer fitter (see "The webview runtime" in `../../CLAUDE.md`).

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting anything.
