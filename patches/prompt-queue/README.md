# Prompt Queue

**Type:** feature
**Touches:** `extension.js + webview/index.css`
**Guard marker:** `/* QUEUE */`

Codex-style queue: hold messages while Claude is busy, edit / reorder / skip, sent one per turn. `queue.css` -> stylesheet, `queue.js` -> injected after the INPUTRTL/ZOOM script (uses the webview nonce + image-preview class hash).

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting anything.
