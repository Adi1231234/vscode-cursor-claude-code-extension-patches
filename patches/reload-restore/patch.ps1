# Reload restore - what is left of "blank / new-chat tabs after Reload Window"
# once the app grew a restore of its own (see README). Two host-side edits:
#   (1) recovery: re-load a webview whose iframe never ran
#   (2) bump the `git worktree list` timeout 5s -> 20s
# Retired, because the app now does it: the webview half (retry
# activateSessionFromServer, 2.1.278) and seeding the saved sessionID on
# deserialize (a tab comes back after 27 idle minutes unpatched, 2.1.295).
# The injected pieces are JS files under js/, filled via Get-InjectedJs - no JS
# lives in the PowerShell. Every anchor captures the minified names; a missing
# anchor just skips that sub-fix.
function Invoke-Patch {
    param($Ctx)

    $js = Read-Text $Ctx.Js
    if ($js -match '/\* RELOADFIX \*/') { Write-Skip 'host reload fixes already patched'; return }
    $applied = $false

    # (1) recovery: re-load an iframe that never started (runtime: js/blank-iframe-recovery.js)
    # The trailing `{` is what separates the definition from the call sites, which
    # pass expressions rather than bare identifiers. Only the panel's name is
    # taken from the signature; the parameter list has grown twice (a fifth entry
    # in 2.1.278, a sixth with a default `=!1` in 2.1.294), so the rest is skipped.
    $sig = [regex]::Match($js, 'setupPanel\(([\w$]+)(?:,[\w$]+(?:=[\w$!.]+)?)+\)\{')
    if ($sig.Success) {
        # The captured name is spliced back into a regex, so it must be escaped:
        # the minifier uses `$` as an identifier, and an unescaped `$` is an
        # end-of-string anchor.
        $pe = [regex]::Escape($sig.Groups[1].Value)
        # setupPanel's own render of this panel, arguments and all. The recovery
        # replays exactly that call rather than rebuilding it from parameter
        # positions: getHtmlForWebview went from four arguments here to seven.
        $html = [regex]::Match($js.Substring($sig.Index, [Math]::Min(2000, $js.Length - $sig.Index)),
            $pe + '\.webview\.html=this\.getHtmlForWebview\(([^;()]+)\);')
        # Between the message listener and the view-state listener. Both ends kept
        # to their shape rather than their contents: the listener's disposables
        # argument went from `this.disposables` to a local array in 2.1.278, and
        # the `let` line between them has gained and lost declarations twice.
        $rx2 = '([\w$]+\?\.fromClient\([\w$]+\)\},null,[\w$.]+\);)(let [\w$]+=[^;]{0,200};' + $pe + '\.onDidChangeViewState)'
        if ($html.Success -and $js -match $rx2) {
            $rec = Get-InjectedJs (Join-Path $PSScriptRoot 'js/blank-iframe-recovery.js') ([ordered]@{
                '__PE__' = $sig.Groups[1].Value; '__HTML_ARGS__' = $html.Groups[1].Value
            })
            # Literal text from the bundle goes into a replacement string: a `$`
            # in it must not read as a group reference.
            $js = [regex]::Replace($js, $rx2, ('${1}' + $rec.Replace('$', '$$') + '${2}'))
            $applied = $true; Write-Ok 'blank-iframe recovery'
        } elseif (-not $html.Success) { Write-Miss 'setupPanel render call not found'
        } else { Write-Miss 'setupPanel view-state anchor not found' }
    } else { Write-Miss 'setupPanel signature not found' }

    # (2) git worktree list timeout 5s -> 20s (runtime value: js/timeout.js)
    $rxT = '("worktree","list","--porcelain"\],\{cwd:[\w$]+,timeout:)5000(,windowsHide)'
    if ($js -match $rxT) {
        $timeout = Get-InjectedJs (Join-Path $PSScriptRoot 'js/timeout.js')
        $js = [regex]::Replace($js, $rxT, ('${1}' + $timeout + '${2}'))
        $applied = $true; Write-Ok 'git-worktree-list timeout 5000->20000'
    } else { Write-Miss 'git-worktree-list timeout anchor not found' }

    if ($applied) { Write-Text $Ctx.Js ("/* RELOADFIX */`n" + $js) }
}
