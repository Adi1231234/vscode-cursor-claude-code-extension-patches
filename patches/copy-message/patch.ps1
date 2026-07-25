# Copy-message - a copy-to-clipboard icon at the end of every chat message.
#   copy-message.css -> appended to the webview stylesheet
#   copy-message.js  -> injected after the QUEUE script (falls back to the
#                       earlier links of the webview-script chain).
function Invoke-Patch {
    param($Ctx)
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'copy-message.css') '/* COPYMSG */' 'copy-message CSS'

    $script = Get-InjectedJs (Join-Path $PSScriptRoot 'copy-message.js') ([ordered]@{
        '__NONCE__'   = $Ctx.Nonce
        '__MSG__'     = "message_$($Ctx.MsgHash)"
        '__USERMSG__' = "userMessage_$($Ctx.MsgHash)"
        '__ACTBTN__'  = $Ctx.MsgActionBtnClass
    })
    Add-ScriptAfterMarker $Ctx $script '/* COPYMSG */' 'copy-message JS' @('/* QUEUE */', '/* INPUTRTL */', '/* ZOOM */')
}
