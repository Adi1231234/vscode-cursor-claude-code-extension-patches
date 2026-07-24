# Bypass permission mode

**Type:** feature
**Touches:** `webview/index.js`
**Guard marker:** `permissionMode=...("bypassPermissions")`

Defaults the webview's permission mode to `bypassPermissions` instead of `default`. The replacement (with the captured signal-fn name filled into `__FN__`) lives in `bypass-mode.js` - no JS inline in `patch.ps1`.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting anything.
