# "Restart Claude" in the panel header, next to Session history: reloads the one
# panel it was clicked in - webview and CLI process both - instead of the whole
# window.
#
# Three sites, two files, one feature, so they are written as a unit: every
# anchor is resolved first and nothing is written unless all of them matched. A
# button with no host handler behind it is worse than no button.
#
#   webview/index.js  the header button itself (js/restart-button.js) - a
#                     zero-width insert before the Session history button that
#                     captures the app's own icon-button component and the
#                     context/store it is rendered with
#   extension.js      __ccReloadWebview + the per-webview shape record on
#                     getHtmlForWebview (js/host-reload.js), and js/host-hook.js
#                     at every chat surface's message listener, installed by the
#                     shared Add-WebviewMessageHook
function Invoke-Patch {
    param($Ctx)
    if (-not (Test-Path $Ctx.WebJs)) { Write-Miss 'webview/index.js not found'; return }
    $wc = Read-Text $Ctx.WebJs
    $xc = Read-Text $Ctx.Js
    if ($wc.Contains('/* PANELRESTARTBTN */') -and $xc.Contains('/* PANELRESTART */')) {
        Write-Skip 'already patched'; return
    }

    # <j>(<icon button>,{ref:<r>,ariaLabel:"Session history",...}),<j>(<same>,{ariaLabel:"New session",...
    # Zero-width: the lookahead only identifies the header group and captures the
    # minified element factory / component / context / store names - nothing is
    # consumed or retyped. The factory is captured rather than written: it was `b`
    # when this was authored and is `j` now, and the name carries no meaning.
    $rxBtn = '(?=([\w$]+)\(([\w$]+),\{ref:[\w$]+,ariaLabel:"Session history",iconSize:20,.{0,60}?\}\),' +
             '\1\(\2,\{ariaLabel:"New session",iconSize:20,onClick:\(\)=>\{' +
             'if\(!([\w$]+)\.startNewConversationTab\(\)\)([\w$]+)\.createSession\(\)\})'
    # getHtmlForWebview(<webview>,<session>,<prompt>,<sidebar>,<fullEditor>,<listOnly>){
    # - the definition; every call site carries a `this.` prefix and real arguments.
    $rxHtml = '(getHtmlForWebview\(([\w$]+),([\w$]+),([\w$]+),([\w$]+),([\w$]+),([\w$]+)\)\{)'

    $nBtn = [regex]::Matches($wc, $rxBtn).Count
    $nHtml = [regex]::Matches($xc, $rxHtml).Count
    if ($nBtn -ne 1) { Write-Miss "header button anchor not found ($nBtn matches)"; return }
    if ($nHtml -ne 1) { Write-Miss "getHtmlForWebview anchor not found ($nHtml matches)"; return }

    $hooked = Add-WebviewMessageHook $xc (Join-Path $PSScriptRoot 'js\host-hook.js')
    if (-not $hooked) { Write-Miss 'webview message-listener anchor not found'; return }

    $button = Get-InjectedJs (Join-Path $PSScriptRoot 'js\restart-button.js') ([ordered]@{
            '__FACTORY__' = '${1}'
            '__BUTTON__'  = '${2}'
            '__CONTEXT__' = '${3}'
            '__STORE__'   = '${4}'
        })
    $reload = Get-InjectedJs (Join-Path $PSScriptRoot 'js\host-reload.js') ([ordered]@{
            '__SIGNATURE__'   = '${1}'
            '__WEBVIEW__'     = '${2}'
            '__SIDEBAR__'     = '${5}'
            '__FULL_EDITOR__' = '${6}'
            '__LIST_ONLY__'   = '${7}'
        })

    Write-Text $Ctx.WebJs ([regex]::Replace($wc, $rxBtn, $button))
    Write-Text $Ctx.Js ([regex]::Replace($hooked, $rxHtml, $reload))
    Write-Ok 'restart button in the header, reloading one panel'
}
