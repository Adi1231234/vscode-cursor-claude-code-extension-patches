# Auto follow-up: when a turn ends, a second model reads what Claude wrote and
# types the next message in the user's place. Three edits:
#   webview/index.css : the button, the lane and the manage dialog
#   extension.js      : the host runtime (host/*.js) - the responders folder, the
#                       CLI run, the "__ccaf" handler - plus a hook in each chat
#                       webview's onDidReceiveMessage so those messages are
#                       answered before the app's protocol switch sees them
#   extension.js      : the panel script (af/*.js), injected after the queue's,
#                       because it consumes window.__qAuto which that one defines
#
# Order inside each list is explicit, not filename-sorted: 'config' opens the
# IIFE / <script> and 'runtime' closes it, and on the host side 'format' must be
# defined before 'store' reads through it.
function Invoke-Patch {
    param($Ctx)

    Add-StyleBlock $Ctx (Get-LibCssPath 'ccScroll.css') '/* CCSCROLL */' 'shared scrollbar CSS'
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'followup.css') '/* AUTOFOLLOWUP */' 'auto follow-up CSS'

    # ---------------- extension.js (host runtime + message hook) ----------------
    $js = Read-Text $Ctx.Js
    if ($js.Contains('/* AUTOFOLLOWUPHOST */')) {
        Write-Skip 'host runtime already patched'
    } else {
        $js = Add-WebviewMessageHook $js (Join-Path $PSScriptRoot 'host/hook.js')
        if (-not $js) {
            Write-Miss 'webview message-listener anchor not found'
        } else {
            $parts = @('stamp', 'format', 'store', 'samples', 'prompt', 'run', 'handle')
            $hostJs = ($parts | ForEach-Object { Read-Text (Join-Path $PSScriptRoot "host/$_.js") }) -join ''
            $hostJs = Expand-JsTokens $hostJs ([ordered]@{ '__CCSTAMP__' = $script:CcStamp })
            Write-Text $Ctx.Js ("/* AUTOFOLLOWUPHOST */`n" + $hostJs.Trim() + "`n" + $js)
            Write-Ok 'host responder store + CLI runner + __ccaf hook'
        }
    }

    # ---------------- webview script ----------------
    # Anchored on the queue's own marker: this patch calls window.__qAuto, which
    # queue/flush-init.js defines, so it has to be injected after it. apply.ps1
    # runs prompt-queue first for the same reason.
    $order = Get-Content (Join-Path $PSScriptRoot 'af/order.json') -Raw | ConvertFrom-Json
    # The message selectors are the same detected names copy-message uses: the
    # transcript is read from the DOM, because nothing in the app exposes a
    # message list on the session store.
    $parts = @((Join-Path $PSScriptRoot "af/$($order[0]).js"), (Get-LibJsPath 'ccRow.js')) +
        ($order | Select-Object -Skip 1 | ForEach-Object { Join-Path $PSScriptRoot "af/$_.js" })
    $script = ($parts | ForEach-Object { Read-Text $_ }) -join ''
    $script = Expand-JsTokens $script ([ordered]@{
        '__NONCE__'   = $Ctx.Nonce
        '__MSG__'     = "message_$($Ctx.MsgHash)"
        '__USERMSG__' = "userMessage_$($Ctx.MsgHash)"
        '__THINK__'   = $Ctx.ThinkingClass
        '__TOOLUSE__' = $Ctx.ToolUseClass
        '__TOOLRES__' = $Ctx.ToolResultClass;
        '__CCSTAMP__' = $script:CcStamp
    })
    Add-ScriptAfterMarker $Ctx $script '/* AUTOFOLLOWUP */' 'auto follow-up JS' @('/* QUEUE */')
}
