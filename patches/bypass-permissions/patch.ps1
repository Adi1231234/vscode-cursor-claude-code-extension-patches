# Bypass permission mode - default the webview's permission mode to
# "bypassPermissions" instead of "default".
function Invoke-Patch {
    param($Ctx)
    if (-not (Test-Path $Ctx.WebJs)) { Write-Miss "webview/index.js not found"; return }
    $wc = Read-Text $Ctx.WebJs
    if ($wc -match 'permissionMode=\w+\("bypassPermissions"\)') { Write-Skip 'already patched'; return }
    if ($wc -match 'permissionMode=(\w+)\("default"\)') {
        $fn = $matches[1]
        $wc = $wc.Replace("permissionMode=$fn(`"default`")", "permissionMode=$fn(`"bypassPermissions`")")
        Write-Text $Ctx.WebJs $wc
        Write-Ok "bypass mode (signal fn: $fn)"
    } else {
        Write-Miss 'permissionMode default not found'
    }
}
