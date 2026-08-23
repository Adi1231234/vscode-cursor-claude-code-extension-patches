# Copy-message - a copy-to-clipboard icon on every chat message.
#   copy-message.css -> appended to the webview stylesheet
#   copy/*.js        -> fragments concatenated in the explicit $parts list below
#                       into one script, injected after the QUEUE script (falling
#                       back to the earlier links of the webview-script chain).
# Order is explicit, not filename-sorted: 'config' opens the IIFE / <script> and
# 'place-observe' closes it; lib/js/ccCopyText.js is the shared clipboard runtime.
function Invoke-Patch {
    param($Ctx)
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'copy-message.css') '/* COPYMSG */' 'copy-message CSS'

    $parts = @(
        (Join-Path $PSScriptRoot 'copy/config.js')
        (Get-LibJsPath 'ccCopyText.js')
        (Join-Path $PSScriptRoot 'copy/button.js')
        (Join-Path $PSScriptRoot 'copy/place-observe.js')
    )
    $script = ($parts | ForEach-Object { Read-Text $_ }) -join ''
    $script = Expand-JsTokens $script ([ordered]@{
        '__NONCE__'   = $Ctx.Nonce
        '__MSG__'     = "message_$($Ctx.MsgHash)"
        '__USERMSG__' = "userMessage_$($Ctx.MsgHash)"
        '__ACTBTN__'  = $Ctx.MsgActionBtnClass
        '__MD__'      = $Ctx.MdRootClass
        '__THINK__'   = $Ctx.ThinkingClass
        '__TOOLUSE__' = $Ctx.ToolUseClass
        '__TOOLRES__' = $Ctx.ToolResultClass
    })
    Add-ScriptAfterMarker $Ctx $script '/* COPYMSG */' 'copy-message JS' @('/* QUEUE */', '/* INPUTRTL */', '/* ZOOM */')
}
