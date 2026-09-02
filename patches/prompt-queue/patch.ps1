# Prompt Queue (Codex-style): hold messages while Claude is busy, edit / reorder /
# skip, sent one per turn.
#   queue.css / queue/modal.css / saved/saved.css -> appended to the webview stylesheet
#   order.json  -> THE ordered fragment list, concatenated into one injected
#                  script (each fragment < 150 lines). 'queue/config-dom' must
#                  open the IIFE / <script> and 'queue/flush-init' must close it;
#                  the middle is grouped by concern, with saved/ (the
#                  saved-queues feature) as its own block, and lib/js/ccStore +
#                  ccRow dropped in right after the fragment that opens the IIFE
#                  (background-tasks pulls in the same two files).
#
# The list is READ, not repeated. tools/check-injected.mjs reads the same file:
# when each kept its own copy the checker went stale the moment saved/ landed and
# went on reporting "ok (18 fragments)" for a bundle that ships 27 - passing
# against a bundle the product never ships is the one thing a checker must not do.
function Invoke-Patch {
    param($Ctx)
    Add-StyleBlock $Ctx (Get-LibCssPath 'ccScroll.css') '/* CCSCROLL */' 'shared scrollbar CSS'
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'queue.css') '/* QUEUE */' 'queue CSS'
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'queue/modal.css') '/* QMODAL */' 'shared dialog CSS'
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'saved/saved.css') '/* QSAVED */' 'saved queues CSS'

    $repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
    $order = Get-Content (Join-Path $PSScriptRoot 'order.json') -Raw | ConvertFrom-Json
    $script = ($order | ForEach-Object { Read-Text (Join-Path $repo $_) }) -join ''
    $script = Expand-JsTokens $script ([ordered]@{ '__NONCE__' = $Ctx.Nonce; '__PVHASH__' = $Ctx.PvHash })
    Add-ScriptAfterMarker $Ctx $script '/* QUEUE */' 'queue JS' @('/* INPUTRTL */', '/* ZOOM */')
}
