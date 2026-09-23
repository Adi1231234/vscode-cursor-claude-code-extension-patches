# Reload restore - what is left of "blank / new-chat tabs after Reload Window"
# once the app grew a restore of its own (see README). Three host-side edits:
#   (1) seed the saved sessionID on deserialize - the app restores only inside a
#       10-minute freshness window, and this removes the window
#   (2) recovery: re-load a webview whose iframe never ran
#   (3) bump the `git worktree list` timeout 5s -> 20s
# The webview half (retry activateSessionFromServer instead of new-chatting) is
# gone: the app rewrote that boot path in 2.1.278 and retries by itself.
# The injected pieces are JS files under js/, filled via Get-InjectedJs - no JS
# lives in the PowerShell. Every anchor captures the minified names; a missing
# anchor just skips that sub-fix.
function Invoke-Patch {
    param($Ctx)

    $js = Read-Text $Ctx.Js
    if ($js -match '/\* RELOADFIX \*/') { Write-Skip 'host reload fixes already patched'; return }
    $applied = $false

    # (1) session id through deserialize (runtime: js/session-id.js, __STATE__ -> ${3})
    $rx1 = '(deserializeWebviewPanel\(([\w$]+),([\w$]+)\)\{[\s\S]{0,200}?[\w$]+\.setupPanel\(\2,)void 0(,void 0,[\w$]+\))'
    if ($js -match $rx1) {
        $sid = Get-InjectedJs (Join-Path $PSScriptRoot 'js/session-id.js') @{ '__STATE__' = '${3}' }
        $js = [regex]::Replace($js, $rx1, ('${1}' + $sid + '${4}'))
        $applied = $true; Write-Ok 'session-restore (deserialize passes sessionID)'
    } else { Write-Miss 'deserialize anchor not found' }

    # (2) recovery: re-load an iframe that never started (runtime: js/blank-iframe-recovery.js)
    # The trailing `{` is what separates the definition from the call sites, which
    # pass expressions rather than bare identifiers. The parameter list is matched
    # with a tolerant tail because it grows: four through 2.1.258, five from
    # 2.1.278 - and only the first four are the ones getHtmlForWebview is handed,
    # here and inside setupPanel itself.
    $sig = [regex]::Match($js, 'setupPanel\(([\w$]+),([\w$]+),([\w$]+),([\w$]+)(?:,[\w$]+)*\)\{')
    if ($sig.Success) {
        # The captured name is spliced back into a regex, so it must be escaped:
        # the minifier uses `$` as an identifier, and an unescaped `$` is an
        # end-of-string anchor.
        $pe = [regex]::Escape($sig.Groups[1].Value)
        # Between the message listener and the view-state listener. Both ends kept
        # to their shape rather than their contents: the listener's disposables
        # argument went from `this.disposables` to a local array in 2.1.278, and
        # the `let` line between them has gained and lost declarations twice.
        $rx2 = '([\w$]+\?\.fromClient\([\w$]+\)\},null,[\w$.]+\);)(let [\w$]+=[^;]{0,200};' + $pe + '\.onDidChangeViewState)'
        if ($js -match $rx2) {
            $rec = Get-InjectedJs (Join-Path $PSScriptRoot 'js/blank-iframe-recovery.js') ([ordered]@{
                '__PE__' = $sig.Groups[1].Value; '__PT__' = $sig.Groups[2].Value
                '__PR__' = $sig.Groups[3].Value; '__PN__' = $sig.Groups[4].Value
            })
            $js = [regex]::Replace($js, $rx2, ('${1}' + $rec + '${2}'))
            $applied = $true; Write-Ok 'blank-iframe recovery'
        } else { Write-Miss 'setupPanel view-state anchor not found' }
    } else { Write-Miss 'setupPanel signature not found' }

    # (3) git worktree list timeout 5s -> 20s (runtime value: js/timeout.js)
    $rxT = '("worktree","list","--porcelain"\],\{cwd:[\w$]+,timeout:)5000(,windowsHide)'
    if ($js -match $rxT) {
        $timeout = Get-InjectedJs (Join-Path $PSScriptRoot 'js/timeout.js')
        $js = [regex]::Replace($js, $rxT, ('${1}' + $timeout + '${2}'))
        $applied = $true; Write-Ok 'git-worktree-list timeout 5000->20000'
    } else { Write-Miss 'git-worktree-list timeout anchor not found' }

    if ($applied) { Write-Text $Ctx.Js ("/* RELOADFIX */`n" + $js) }
}
