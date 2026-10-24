# Prompt Queue (Codex-style): hold messages while Claude is busy, edit / reorder /
# skip, sent one per turn.
#   styles.json -> THE ordered stylesheet list (queue.css, saved/saved.css and
#                  the shared lib/css ones), appended to the webview stylesheet;
#                  the desktop build reads the same file
#   order.json  -> THE ordered fragment list, concatenated into one injected
#                  script (each fragment < 150 lines). 'queue/open' opens the
#                  <script> / IIFE and 'queue/close' closes it; 'queue/env-vscode'
#                  is everything the queue knows about this panel's DOM (the
#                  desktop build swaps those three for its own); the middle is
#                  grouped by concern, with saved/ (the saved-queues feature) as
#                  its own block, and the lib/js runtime (ccStore, ccRow, ccDom,
#                  ccWatch, ccSession, ccClock) near the top.
#
# Both lists are READ, not repeated. tools/check-injected.mjs reads the same file:
# when each kept its own copy the checker went stale the moment saved/ landed and
# went on reporting "ok (18 fragments)" for a bundle that ships 27 - passing
# against a bundle the product never ships is the one thing a checker must not do.
function Invoke-Patch {
    param($Ctx)
    $repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
    foreach ($s in (Get-Content (Join-Path $PSScriptRoot 'styles.json') -Raw | ConvertFrom-Json)) {
        Add-StyleBlock $Ctx (Join-Path $repo $s.path) $s.guard $s.label
    }

    $order = Get-Content (Join-Path $PSScriptRoot 'order.json') -Raw | ConvertFrom-Json
    $script = ($order | ForEach-Object { Read-Text (Join-Path $repo $_) }) -join ''
    $script = Expand-JsTokens $script ([ordered]@{ '__NONCE__' = $Ctx.Nonce; '__PVHASH__' = $Ctx.PvHash })
    Add-ScriptAfterMarker $Ctx $script '/* QUEUE */' 'queue JS' @('/* INPUTRTL */', '/* ZOOM */')
}
