# Bypass permission mode - make "bypassPermissions" the mode every session starts in.
# Two independent sites, each with its own guard, so an install patched before the
# second site existed still picks it up on the next run (see CLAUDE.md).

# webview/index.js - seed the permissionMode signal. Up to 2.1.221 it was seeded with
# "default"; from 2.1.222 it starts as `void 0` and renders as "default" via
# `?? "default"`, so the anchor accepts either seed and the minified signal-fn name is
# captured rather than assumed.
function Set-BypassSignalSeed {
    param($Ctx)
    if (-not (Test-Path $Ctx.WebJs)) { Write-Miss "webview/index.js not found"; return }
    $wc = Read-Text $Ctx.WebJs
    if ($wc -match 'permissionMode=[\w$]+\("bypassPermissions"\)') { Write-Skip 'signal seed already patched'; return }
    $m = [regex]::Match($wc, 'permissionMode=([\w$]+)\((?:"default"|void 0)\)')
    if (-not $m.Success) { Write-Miss 'permissionMode initialiser not found'; return }
    $fn = $m.Groups[1].Value
    $new = Get-InjectedJs (Join-Path $PSScriptRoot 'bypass-mode.js') @{ '__FN__' = $fn }
    Write-Text $Ctx.WebJs ($wc.Replace($m.Value, $new))
    Write-Ok "signal seed (signal fn: $fn)"
}

# extension.js - the host's initial-mode resolution. The webview overwrites the seeded
# signal with config.initialPermissionMode on every session it builds, so seeding alone
# stops working the moment that resolution returns something else - which is what the
# auto-mode rollout did by leaving "auto" in the persisted globalState default.
function Set-BypassInitialMode {
    param($Ctx)
    if (-not (Test-Path $Ctx.Js)) { Write-Miss "extension.js not found"; return }
    $js = Read-Text $Ctx.Js
    if ($js.Contains('/* BYPASS-INITIAL-MODE */')) { Write-Skip 'initial mode already patched'; return }
    $anchor = 'getInitialPermissionMode(){'
    if (-not $js.Contains($anchor)) { Write-Miss 'getInitialPermissionMode() not found'; return }
    $new = Get-InjectedJs (Join-Path $PSScriptRoot 'initial-mode.js')
    Write-Text $Ctx.Js ($js.Replace($anchor, $new))
    Write-Ok 'initial permission mode'
}

function Invoke-Patch {
    param($Ctx)
    Set-BypassSignalSeed $Ctx
    Set-BypassInitialMode $Ctx
}
