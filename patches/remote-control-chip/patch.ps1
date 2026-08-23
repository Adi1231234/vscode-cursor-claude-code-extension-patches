# Remote Control chip - replace the full-width "Remote Control is active"
# banner above the input with a small status icon in the input footer row.
# Two coupled edits in webview/index.js (see README):
#   (1) neuter the banner component (it returns null before rendering)
#   (2) render __ccRcChip(...) in the input footer, right after the spacer
# Both must match or the file is left untouched - hiding the banner without the
# chip would drop the status entirely. The runtime is runtime/*.js, concatenated
# in the explicit $parts order below; the two inserted snippets live in
# chip-call.js / hide-banner.js.
function Invoke-Patch {
    param($Ctx)
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'remote-control-chip.css') '/* RCCHIP */' 'remote-control chip CSS'
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'remote-control-dialog.css') '/* RCDIALOG */' 'remote-control dialog CSS'

    if (-not (Test-Path $Ctx.WebJs)) { Write-Miss 'webview/index.js not found'; return }
    $wc = Read-Text $Ctx.WebJs
    if ($wc.Contains('/* RCCHIP */')) { Write-Skip 'already patched'; return }

    # (1) the banner component: anchored on its props shape plus the close
    # tooltip that identifies it (the body between them may be reworded).
    $rxBanner = 'function \w+\(\{state:\w+,onClose:\w+,otherPopupsVisible:\w+\}\)\{(?=[\s\S]{0,400}?closeTooltip:"Disconnect Remote Control")'
    if ($wc -notmatch $rxBanner) { Write-Miss 'Remote Control banner anchor not found'; return }

    # (2) the input footer: from the footer component's signature (semantic prop
    # names) to the flex spacer inside it, which yields the minified jsx factory
    # and the CSS-module map without hardcoding either.
    $rxFooter = 'function \w+\(\{session:(\w+),mode:\w+,availablePermissionModes:[\s\S]{0,6000}?(\w+)\("div",\{className:(\w+)\.spacer\}\),'
    $m = [regex]::Match($wc, $rxFooter)
    if (-not $m.Success) { Write-Miss 'input-footer spacer anchor not found'; return }

    $parts = @('icon.js', 'copy.js', 'dialog-parts.js', 'dialog.js', 'chip.js')
    $runtime = ($parts | ForEach-Object { Read-Text (Join-Path $PSScriptRoot "runtime/$_") }) -join "`n"

    $call = Get-InjectedJs (Join-Path $PSScriptRoot 'chip-call.js') ([ordered]@{
        '__JSX__' = '${2}'; '__SESSION__' = '${1}'; '__CSS__' = '${3}'
    })
    $hide = Get-InjectedJs (Join-Path $PSScriptRoot 'hide-banner.js')

    $wc = [regex]::Replace($wc, $rxBanner, ('$&' + $hide))
    $wc = [regex]::Replace($wc, $rxFooter, ('$&' + $call))
    Write-Text $Ctx.WebJs ("/* RCCHIP */`n" + $runtime + "`n" + $wc)
    Write-Ok "banner -> footer chip (session: $($m.Groups[1].Value), css: $($m.Groups[3].Value))"
}
