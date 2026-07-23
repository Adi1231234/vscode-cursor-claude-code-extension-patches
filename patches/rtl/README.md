# RTL text

**Type:** feature
**Touches:** `webview/index.css`
**Guard marker:** `/* RTL patch */`

Right-to-left rendering for the chat + AskUserQuestion dialogs (Hebrew/Arabic); code blocks stay LTR. Appends `rtl.css` to the webview stylesheet.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting anything.
