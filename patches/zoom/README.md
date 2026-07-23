# Zoom

**Type:** feature
**Touches:** `extension.js`
**Guard marker:** `/* ZOOM */`

`Ctrl`+Scroll / pinch to zoom the webview, persisted in `localStorage`. Injects a small script after the module `<script>` tag. Run before `input-rtl` and `prompt-queue` (they anchor after it).

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting anything.
