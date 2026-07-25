# Copy-message - a copy-to-clipboard icon on every chat message.
#   copy-message.css -> appended to the webview stylesheet
#   copy/*.js        -> fragments concatenated in the explicit $order below into
#                       one script, injected after the QUEUE script (falling back
#                       to the earlier links of the webview-script chain).
# Order is explicit, not filename-sorted: 'config-clipboard' opens the IIFE /
# <script> and 'place-observe' closes it.
function Invoke-Patch {
    param($Ctx)
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'copy-message.css') '/* COPYMSG */' 'copy-message CSS'

    $order = @('config-clipboard', 'button', 'place-observe')
    $script = ($order | ForEach-Object { Read-Text (Join-Path $PSScriptRoot "copy/$_.js") }) -join ''
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
