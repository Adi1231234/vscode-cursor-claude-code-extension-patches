# Inline-code copy - double-click an inline code chip in the transcript to copy it.
#   inline-code-copy.css -> appended to the webview stylesheet
#   code/*.js            -> fragments concatenated in the explicit $parts list
#                           below into one script, injected after the MSGBIDI
#                           script (falling back to the earlier links of the
#                           webview-script chain).
# Order is explicit, not filename-sorted: 'config' opens the IIFE / <script> and
# 'dblclick-copy' closes it; lib/js/ccCopyText.js is the shared clipboard runtime.
function Invoke-Patch {
    param($Ctx)
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'inline-code-copy.css') '/* INLINECODE */' 'inline-code-copy CSS'

    $parts = @(
        (Join-Path $PSScriptRoot 'code/config.js')
        (Get-LibJsPath 'ccCopyText.js')
        (Join-Path $PSScriptRoot 'code/dblclick-copy.js')
    )
    $script = ($parts | ForEach-Object { Read-Text $_ }) -join ''
    $script = Expand-JsTokens $script ([ordered]@{ '__NONCE__' = $Ctx.Nonce })
    Add-ScriptAfterMarker $Ctx $script '/* INLINECODE */' 'inline-code-copy JS' @('/* MSGBIDI */', '/* COPYMSG */', '/* QUEUE */', '/* INPUTRTL */', '/* ZOOM */')
}
