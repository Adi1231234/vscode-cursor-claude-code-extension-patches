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

    $order = @(
        'config-dom', 'log', 'session', 'busy-files', 'chips-preview', 'persist', 'model',
        'schedule-lib', 'schedule-clock', 'add-button', 'schedule-modal',
        'render-panel', 'render-rows', 'resize-input', 'flush-init'
    )
    $script = ($order | ForEach-Object { Read-Text (Join-Path $PSScriptRoot "queue/$_.js") }) -join ''
    $script = Expand-JsTokens $script ([ordered]@{ '__NONCE__' = $Ctx.Nonce; '__PVHASH__' = $Ctx.PvHash })
    Add-ScriptAfterMarker $Ctx $script '/* QUEUE */' 'queue JS' @('/* INPUTRTL */', '/* ZOOM */')
}
