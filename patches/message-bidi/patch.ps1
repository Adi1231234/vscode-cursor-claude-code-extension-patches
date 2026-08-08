# Message bidi - correct base direction for every rendered message block.
#   message-bidi.css -> appended to the webview stylesheet (lets `dir` win over
#                       the app's own unicode-bidi:plaintext rule)
#   bidi/*.js        -> fragments concatenated in the explicit $order below into
#                       one script, injected after the COPYMSG script (falling
#                       back to the earlier links of the webview-script chain).
# Order is explicit, not filename-sorted: 'direction' opens the IIFE / <script>
# and 'observe' closes it.
function Invoke-Patch {
    param($Ctx)
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'message-bidi.css') '/* MSGBIDI */' 'message-bidi CSS'

    $order = @('direction', 'observe')
    $script = ($order | ForEach-Object { Read-Text (Join-Path $PSScriptRoot "bidi/$_.js") }) -join ''
    $script = Expand-JsTokens $script ([ordered]@{
        '__NONCE__' = $Ctx.Nonce
        '__MD__'    = $Ctx.MdRootClass
    })
    Add-ScriptAfterMarker $Ctx $script '/* MSGBIDI */' 'message-bidi JS' @('/* COPYMSG */', '/* QUEUE */', '/* INPUTRTL */', '/* ZOOM */')
}
