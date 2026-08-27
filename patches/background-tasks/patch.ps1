# Background tasks - an animated indicator in the composer footer and a two-pane
# live-log dialog behind it. Three edits:
#   webview/index.css : the indicator + dialog styles
#   extension.js      : the host-side log reader (host/*.js), plus a hook in each
#                       chat webview's onDidReceiveMessage so "__ccbg" messages are
#                       answered before the app's protocol switch sees them
#   extension.js      : the panel script itself (tasks/*.js), injected after the
#                       prompt-queue script
# Both runtimes live in their own formatted .js fragments; this file only locates,
# fills placeholders, and writes.
function Invoke-Patch {
    param($Ctx)

    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'tasks.css') '/* BGTASKS */' 'indicator + dialog CSS'
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'log.css') '/* BGTASKSLOG */' 'log pane CSS'
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'shell.css') '/* BGTASKSSHELL */' 'dialog shell CSS'
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'rows.css') '/* BGTASKSROWS */' 'task list CSS'
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'feed.css') '/* BGTASKSFEED */' 'log feed CSS'
    Add-StyleBlock $Ctx (Get-LibCssPath 'ccScroll.css') '/* CCSCROLL */' 'shared scrollbar CSS'

    # ---------------- extension.js (host reader + message hook) ----------------
    $js = Read-Text $Ctx.Js
    if ($js.Contains('/* BGTASKSHOST */')) {
        Write-Skip 'host reader already patched'
    } else {
        # The shared listener hook (lib/Patch.ps1) puts host/hook.js at the top of
        # every chat surface's onDidReceiveMessage, ahead of the app's protocol switch.
        $js = Add-WebviewMessageHook $js (Join-Path $PSScriptRoot 'host/hook.js')
        if (-not $js) {
            Write-Miss 'webview message-listener anchor not found'
        } else {
            $parts = @('dirs', 'tail', 'handle')
            $hostJs = ($parts | ForEach-Object { Read-Text (Join-Path $PSScriptRoot "host/$_.js") }) -join ''
            Write-Text $Ctx.Js ("/* BGTASKSHOST */`n" + $hostJs.Trim() + "`n" + $js)
            Write-Ok 'host log reader + __ccbg hook'
        }
    }

    # ---------------- webview script ----------------
    # Explicit order, not filename-sorted: 'config-dom' opens the <script> and the
    # IIFE, 'init' closes both. lib/js/ccStore.js is the shared session-store finder
    # (prompt-queue pulls in the same file; its guards make the second copy a no-op).
    $names = @(
        'config-dom', 'store', 'shells', 'stream', 'bridge', 'entry',
        'logpane', 'toolbar', 'footer', 'tail', 'workflow', 'dialog', 'keys',
        'list', 'indicator', 'init'
    )
    $parts = @((Join-Path $PSScriptRoot 'tasks/config-dom.js'), (Get-LibJsPath 'ccStore.js'), (Get-LibJsPath 'ccRow.js')) +
        ($names | Select-Object -Skip 1 | ForEach-Object { Join-Path $PSScriptRoot "tasks/$_.js" })
    $script = ($parts | ForEach-Object { Read-Text $_ }) -join ''
    $script = Expand-JsTokens $script @{ '__NONCE__' = $Ctx.Nonce }
    Add-ScriptAfterMarker $Ctx $script '/* BGTASKS */' 'background-tasks JS' @('/* QUEUE */', '/* INPUTRTL */', '/* ZOOM */')
}
