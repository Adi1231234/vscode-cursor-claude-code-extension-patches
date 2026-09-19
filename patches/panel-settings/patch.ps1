# Panel settings - a gear in the input footer row that opens a small settings
# dialog, and the first setting to live in it: raise a Windows notification when
# a run finishes.
#
# Three coupled edits, and every anchor is resolved before a single byte is
# written. A gear with no host behind it is worse than no gear - it is a control
# that does nothing and says nothing about why.
#
#   (1) webview/index.js - the runtime prepended, and __ccSettingsGear(...)
#       rendered in the input footer right after the flex spacer
#   (2) extension.js     - the toast raiser prepended, plus a __ccnotify guard at
#       the top of every chat surface's onDidReceiveMessage
#   (3) webview/index.css - the gear + dialog stylesheet
#
# The PowerShell that actually raises the toast stays a real .ps1 in host/ and
# travels as -EncodedCommand, so the injected JS carries one opaque constant
# rather than a script inside a string.
function Invoke-Patch {
    param($Ctx)

    if (-not (Test-Path $Ctx.WebJs)) { Write-Miss 'webview/index.js not found'; return }
    if (-not (Test-Path $Ctx.Js)) { Write-Miss 'extension.js not found'; return }

    $wc = Read-Text $Ctx.WebJs
    $js = Read-Text $Ctx.Js
    if ($wc.Contains('/* PANELSETTINGS */')) { Write-Skip 'already patched'; return }

    # (1) The input footer: from the component's semantic signature to the flex
    # spacer inside it. That one match yields the session variable, the minified
    # jsx factory and the CSS-module map, so none of the three is hardcoded.
    $rxFooter = 'function [\w$]+\(\{session:([\w$]+),mode:[\w$]+,availablePermissionModes:[\s\S]{0,6000}?([\w$]+)\("div",\{className:([\w$]+)\.spacer\}\),'
    $m = [regex]::Match($wc, $rxFooter)
    if (-not $m.Success) { Write-Miss 'input-footer spacer anchor not found'; return }

    # (2) The host listener - resolved now, written only once (1) is known good.
    $hooked = Add-WebviewMessageHook $js (Join-Path $PSScriptRoot 'host/hook.js')
    if (-not $hooked) { Write-Miss 'webview message listener not found'; return }

    $ps1 = Read-Text (Join-Path $PSScriptRoot 'host/toast.ps1')
    $b64 = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($ps1))
    $hostJs = Get-InjectedJs (Join-Path $PSScriptRoot 'host/notify.js') @{ '__TOAST_B64__' = $b64 }

    # The dialog chrome is the shared one (prompt-queue's three dialogs use the
    # same file); it guards itself, so whichever of the two lands first wins and
    # the other is a no-op.
    $parts = @(Get-LibJsPath 'ccModal.js') +
             (@('store.js', 'icon.js', 'watch.js', 'dialog.js', 'gear.js') |
                ForEach-Object { Join-Path $PSScriptRoot "runtime/$_" })
    $runtime = ($parts | ForEach-Object { Read-Text $_ }) -join "`n"

    $call = (Get-InjectedJs (Join-Path $PSScriptRoot 'runtime/gear-call.js') ([ordered]@{
        '__JSX__' = '${2}'; '__SESSION__' = '${1}'; '__CSS__' = '${3}'
    })).Trim()

    $wc = [regex]::Replace($wc, $rxFooter, ('$&' + $call))
    Write-Text $Ctx.WebJs ("/* PANELSETTINGS */`n" + $runtime + "`n" + $wc)
    Write-Text $Ctx.Js ("/* NOTIFYHOST */`n" + $hostJs.Trim() + "`n" + $hooked)
    Write-Ok "settings gear + notify-on-finish (session: $($m.Groups[1].Value), css: $($m.Groups[3].Value))"

    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'gear.css') '/* PANELSETTINGSGEAR */' 'settings gear CSS'
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'settings-dialog.css') '/* PANELSETTINGSDIALOG */' 'settings dialog CSS'
}
