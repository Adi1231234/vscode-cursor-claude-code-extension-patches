# Session-history dialog clipped on the left (text cut mid-word, no ellipsis).
# The dropdown is position:fixed, sized with min(400px,100vw - 32px) and placed
# with `right: documentElement.clientWidth - anchorRect.right`. Under the CSS zoom
# this repo's zoom patch applies to <body>, viewport units and clientWidth keep
# reporting the UNZOOMED viewport while every getBoundingClientRect is 1/zoom of
# it - so that subtraction mixes two coordinate systems and both the offset and
# the width come out inflated, pushing the box off the left edge of the panel.
# Fix: read the viewport in the same units as the anchor rect and clamp the box
# into the panel (which also fixes the 6px overhang upstream has at zoom 1).
# The replacement lives in js/dropdown-box.js; its __TOKEN__ placeholders map to
# the regex capture groups, so the site keeps its minified names.
function Invoke-Patch {
    param($Ctx)
    if (-not (Test-Path $Ctx.WebJs)) { Write-Miss 'webview/index.js not found'; return }
    $wc = Read-Text $Ctx.WebJs
    if ($wc.Contains('/* HISTDLGFIX */')) { Write-Skip 'already patched'; return }

    # let <rect>=<ref>.current?.getBoundingClientRect(),<view>=document.documentElement.clientWidth,<style>=<rect>?{top:...}:{};
    $rx = 'let (\w+)=(\w+)\.current\?\.getBoundingClientRect\(\),' +
          '(\w+)=document\.documentElement\.clientWidth,(\w+)=\1\?\{top:.{0,220}?\}:\{\};'
    $hits = [regex]::Matches($wc, $rx)
    if ($hits.Count -ne 1) {
        Write-Miss "history dialog placement anchor not found ($($hits.Count) matches)"
        return
    }

    $new = Get-InjectedJs (Join-Path $PSScriptRoot 'js\dropdown-box.js') ([ordered]@{
            '__RECT__'  = '${1}'
            '__REF__'   = '${2}'
            '__VIEW__'  = '${3}'
            '__STYLE__' = '${4}'
        })
    Write-Text $Ctx.WebJs ([regex]::Replace($wc, $rx, $new))
    Write-Ok 'history dialog placed in panel coordinates (no longer clipped under zoom)'
}
