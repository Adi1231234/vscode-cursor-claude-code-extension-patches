# Bypass permission mode - default the webview's permission mode to
# "bypassPermissions". Up to 2.1.221 the signal was seeded with "default"; from
# 2.1.222 it starts as `void 0` and is rendered as "default" via `?? "default"`,
# so the anchor accepts either seed and the minified signal-fn name is captured
# rather than assumed. The replacement (with __FN__ filled in) lives in bypass-mode.js.
function Invoke-Patch {
    param($Ctx)
    if (-not (Test-Path $Ctx.WebJs)) { Write-Miss "webview/index.js not found"; return }
    $wc = Read-Text $Ctx.WebJs
    if ($wc -match 'permissionMode=[\w$]+\("bypassPermissions"\)') { Write-Skip 'already patched'; return }
    $m = [regex]::Match($wc, 'permissionMode=([\w$]+)\((?:"default"|void 0)\)')
    if (-not $m.Success) { Write-Miss 'permissionMode initialiser not found'; return }
    $fn = $m.Groups[1].Value
    $new = Get-InjectedJs (Join-Path $PSScriptRoot 'bypass-mode.js') @{ '__FN__' = $fn }
    Write-Text $Ctx.WebJs ($wc.Replace($m.Value, $new))
    Write-Ok "bypass mode (signal fn: $fn)"
}
