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
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'scroll.css') '/* BGTASKSSCROLL */' 'scrollbar CSS'

    # ---------------- extension.js (host reader + message hook) ----------------
    $js = Read-Text $Ctx.Js
    if ($js.Contains('/* BGTASKSHOST */')) {
        Write-Skip 'host reader already patched'
    } else {
        # Every chat surface installs the same listener shape; capture the webview,
        # the message and the comms names rather than assuming any of them.
        $rx = '(\w+)\.webview\.onDidReceiveMessage\(\((\w+)\)=>\{(this\.output\.info\([^;]*?\),)(\w+)\?\.fromClient\(\2\)\}'
        if ($js -notmatch $rx) {
            Write-Miss 'webview message-listener anchor not found'
        } else {
            $hook = (Get-InjectedJs (Join-Path $PSScriptRoot 'host/hook.js') ([ordered]@{
                '__MSG__' = '${2}'; '__WV__' = '${1}'; '__COMMS__' = '${4}'
            })).Trim()
            $js = [regex]::Replace($js, $rx, ('${1}.webview.onDidReceiveMessage((${2})=>{' + $hook + '${3}${4}?.fromClient(${2})}'))
            $parts = @('dirs', 'tail', 'handle')
            $hostJs = ($parts | ForEach-Object { Read-Text (Join-Path $PSScriptRoot "host/$_.js") }) -join ''
            Write-Text $Ctx.Js ("/* BGTASKSHOST */`n" + $hostJs.Trim() + "`n" + $js)
            Write-Ok 'host log reader + __ccbg hook'
        }
    }

    # ---------------- webview script ----------------
    # '@ccStore' is the shared store finder from lib/js (prompt-queue injects the
    # same file; its own guards make the second copy a no-op).
    $order = @(
        'config-dom', '@ccStore', 'store', 'shells', 'stream', 'bridge', 'entry',
        'logpane', 'toolbar', 'footer', 'tail', 'workflow', 'dialog', 'keys',
        'list', 'indicator', 'init'
    )
    $script = ($order | ForEach-Object {
        if ($_ -eq '@ccStore') { "`n" + (Get-CcStoreHelper) + "`n" }
        else { Read-Text (Join-Path $PSScriptRoot "tasks/$_.js") }
    }) -join ''
    $script = Expand-JsTokens $script @{ '__NONCE__' = $Ctx.Nonce }
    Add-ScriptAfterMarker $Ctx $script '/* BGTASKS */' 'background-tasks JS' @('/* QUEUE */', '/* INPUTRTL */', '/* ZOOM */')
}
