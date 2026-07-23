# Prompt Queue (Codex-style): hold messages while Claude is busy, edit / reorder /
# skip, sent one per turn.
#   queue.css  -> appended to the webview stylesheet
#   queue/*.js -> ordered fragments (each < 150 lines) concatenated into one script
#                 and injected after the INPUTRTL (or ZOOM) script.
function Invoke-Patch {
    param($Ctx)
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'queue.css') '/* QUEUE */' 'queue CSS'

    $parts  = Get-ChildItem (Join-Path $PSScriptRoot 'queue') -Filter *.js | Sort-Object Name
    $script = ($parts | ForEach-Object { Read-Text $_.FullName }) -join ''
    $script = $script -replace '__NONCE__', $Ctx.Nonce -replace '__PVHASH__', $Ctx.PvHash
    Add-ScriptAfterMarker $Ctx $script '/* QUEUE */' 'queue JS' @('/* INPUTRTL */', '/* ZOOM */')
}
