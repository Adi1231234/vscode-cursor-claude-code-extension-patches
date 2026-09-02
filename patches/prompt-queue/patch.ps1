# Prompt Queue (Codex-style): hold messages while Claude is busy, edit / reorder /
# skip, sent one per turn.
#   queue.css / saved/saved.css -> appended to the webview stylesheet
#   queue/*.js + saved/*.js     -> fragments (each < 150 lines) concatenated in
#                  the $order below into one script, injected after the
#                  INPUTRTL (or ZOOM) script.
# Order is explicit (not filename-sorted): 'queue/config-dom' must open the IIFE /
# <script> and 'queue/flush-init' must close it; the middle is grouped by concern,
# with saved/ (the saved-queues feature) as its own block.
function Invoke-Patch {
    param($Ctx)
    Add-StyleBlock $Ctx (Get-LibCssPath 'ccScroll.css') '/* CCSCROLL */' 'shared scrollbar CSS'
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'queue.css') '/* QUEUE */' 'queue CSS'
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'saved/saved.css') '/* QSAVED */' 'saved queues CSS'

    # lib/js/ccStore.js is the shared session-store finder, dropped in right after
    # the fragment that opens the IIFE (background-tasks pulls in the same file).
    $order = @(
        'queue/log', 'queue/modal-shell', 'queue/session', 'queue/busy-files',
        'queue/chips-preview', 'queue/persist', 'queue/debug', 'queue/model',
        'queue/schedule-lib', 'queue/schedule-clock', 'queue/add-button',
        'queue/schedule-modal', 'queue/render-panel', 'queue/row-menu',
        'saved/store', 'saved/modal', 'saved/list', 'saved/edit',
        'queue/render-rows', 'queue/resize-input', 'queue/stop-pause', 'queue/flush-init'
    )
    $parts = @((Join-Path $PSScriptRoot 'queue/config-dom.js'), (Get-LibJsPath 'ccStore.js'), (Get-LibJsPath 'ccRow.js')) +
        ($order | ForEach-Object { Join-Path $PSScriptRoot "$_.js" })
    $script = ($parts | ForEach-Object { Read-Text $_ }) -join ''
    $script = Expand-JsTokens $script ([ordered]@{ '__NONCE__' = $Ctx.Nonce; '__PVHASH__' = $Ctx.PvHash })
    Add-ScriptAfterMarker $Ctx $script '/* QUEUE */' 'queue JS' @('/* INPUTRTL */', '/* ZOOM */')
}
