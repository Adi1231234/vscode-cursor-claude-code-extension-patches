# RTL text

**Type:** feature
**Touches:** `webview/index.css`
**Guard marker:** `/* RTL patch */`

Right-to-left rendering for the chat + AskUserQuestion dialogs (Hebrew/Arabic); code blocks stay LTR. Appends `rtl.css` to the webview stylesheet.

The app's own message times (`[data-message-stamp] time`, from 2.1.287) stay LTR too: "9:23 AM" is Latin text, and in the rtl message list its runs reorder into "AM 9:23".

Note: `direction: rtl` here does **not** reach the blocks of a rendered message - the
app marks them `unicode-bidi: plaintext`, which makes the UA ignore `direction` and
pick a base direction per block from its first strong character. That is what
`../message-bidi/` fixes; read its README before touching message direction.

Exposes a single `Invoke-Patch $Ctx` (dot-sourced and called by `../../apply.ps1`). Idempotent and fail-safe: if its anchor isn't found it skips instead of corrupting anything.
