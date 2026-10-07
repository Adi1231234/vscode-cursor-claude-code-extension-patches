# Input usage - how much of the 5-hour and the weekly usage is left, on a thin
# line at the bottom of the composer box.
#
#   (1) webview/index.js: the app keeps the account's rate-limit windows in one
#       module-level signal that nothing outside its bundle can reach. A getter
#       for it (expose.js) goes in right before the function that writes it,
#       globalThis.__ccUsageWindows().
#   (2) extension.js: the script that subscribes to that signal and draws the
#       line (usage/*.js, in usage/order.json), plus its stylesheet.
# Both anchors are resolved before a byte is written: without the signal the
# script would have nothing to draw.
function Invoke-Patch {
    param($Ctx)

    if (-not (Test-Path $Ctx.WebJs)) { Write-Miss 'webview/index.js not found'; return }
    $wc = Read-Text $Ctx.WebJs
    $sigDone = $wc.Contains('/* INPUTUSAGESIG */')

    if (-not $sigDone) {
        # The host's relay names the function that merges new windows in...
        $mRelay = [regex]::Match($wc, 'case"panel_usage_update":([\w$]+)\([\w$]+\.request\.unifiedWindows\)')
        if (-not $mRelay.Success) { Write-Miss 'panel_usage_update handler not found'; return }
        # ...and that function's first statement reads the signal it writes.
        $rxWrite = 'function ' + [regex]::Escape($mRelay.Groups[1].Value) +
                   '\([\w$]+\)\{let [\w$]+=[\w$]+\(([\w$]+)\.value,'
        $mWrite = [regex]::Match($wc, $rxWrite)
        if (-not $mWrite.Success) { Write-Miss 'usage-windows writer not found'; return }

        $getter = Get-InjectedJs (Join-Path $PSScriptRoot 'expose.js') @{ '__SIG__' = $mWrite.Groups[1].Value }
        $wc = $wc.Substring(0, $mWrite.Index) + $getter.Trim() + "`n" + $wc.Substring($mWrite.Index)
        Write-Text $Ctx.WebJs $wc
        Write-Ok "usage windows exposed (signal: $($mWrite.Groups[1].Value))"
    } else {
        Write-Skip 'usage windows already exposed'
    }

    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'usage.css') '/* INPUTUSAGECSS */' 'input-usage CSS'

    $order = Get-Content (Join-Path $PSScriptRoot 'usage/order.json') -Raw | ConvertFrom-Json
    $parts = @(Join-Path $PSScriptRoot 'usage/open.js')
    # The shared runtime right after the opener: the composer finder (ccStore),
    # write-only-on-change (ccDom) and the one observer (ccWatch). Whichever
    # script runs first defines them; the guards make the rest no-ops.
    $parts += @('ccStore.js', 'ccDom.js', 'ccWatch.js') | ForEach-Object { Get-LibJsPath $_ }
    $parts += $order | Where-Object { $_ -ne 'open' } | ForEach-Object { Join-Path $PSScriptRoot "usage/$_.js" }
    $script = ($parts | ForEach-Object { Read-Text $_ }) -join "`n"
    $script = Expand-JsTokens $script @{ '__NONCE__' = $Ctx.Nonce }
    Add-ScriptAfterMarker $Ctx $script '/* INPUTUSAGE */' 'input-usage JS' @('/* QUEUE */', '/* INPUTRTL */', '/* ZOOM */')
}
