# Prompt Queue (Codex-style): hold messages while Claude is busy, edit / reorder /
# skip, sent one per turn.
#   queue.css   -> appended to the webview stylesheet
#   queue/*.js  -> fragments (each < 150 lines) concatenated in the $order below
#                  into one script, injected after the INPUTRTL (or ZOOM) script.
# Order is explicit (not filename-sorted): 'config-dom' must open the IIFE /
# <script> and 'flush-init' must close it; the middle is grouped by concern.
function Invoke-Patch {
    param($Ctx)
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'queue.css') '/* QUEUE */' 'queue CSS'

    # lib/js/ccStore.js is the shared session-store finder, dropped in right after
    # the fragment that opens the IIFE (background-tasks pulls in the same file).
    $order = @(
        'log', 'session', 'busy-files', 'chips-preview', 'persist', 'model',
        'schedule-lib', 'schedule-clock', 'add-button', 'schedule-modal',
        'render-panel', 'row-menu', 'render-rows', 'resize-input', 'stop-pause', 'flush-init'
    )
    $parts = @(Join-Path $PSScriptRoot 'queue/config-dom.js', (Get-LibJsPath 'ccStore.js')) +
        ($order | ForEach-Object { Join-Path $PSScriptRoot "queue/$_.js" })
    $script = ($parts | ForEach-Object { Read-Text $_ }) -join ''
    $script = Expand-JsTokens $script ([ordered]@{ '__NONCE__' = $Ctx.Nonce; '__PVHASH__' = $Ctx.PvHash })
    Add-ScriptAfterMarker $Ctx $script '/* QUEUE */' 'queue JS' @('/* INPUTRTL */', '/* ZOOM */')
}
