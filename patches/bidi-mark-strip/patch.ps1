# Bidi marks printed as literal escape text in the middle of a message.
# The webview sanitises every rendered string through a Trojan-Source mitigation
# that turns each bidi control character into its own printable escape text, so a
# stray RLM inside an answer is shown rather than applied. Fix: drop the three
# implicit marks (ALM / LRM / RLM) before that pass, and leave the mitigation to
# escape the characters that can actually reorder a run (overrides, embeddings,
# isolates). Base direction stays a per-message decision - see patches/message-bidi.
# The replacement lives in js/strip-marks.js; its __TOKEN__ placeholders map to the
# regex capture groups, so the sanitiser keeps its minified names.
function Invoke-Patch {
    param($Ctx)
    if (-not (Test-Path $Ctx.WebJs)) { Write-Miss 'webview/index.js not found'; return }
    $wc = Read-Text $Ctx.WebJs
    if ($wc.Contains('/* BIDIMARKS */')) { Write-Skip 'already patched'; return }

    # var <rx>=/[...]/g;function <fn>(<arg>){if(typeof <arg>==="string")return <arg>.replace(<rx>,(t)=>`...codePointAt...`
    $rx = 'var (\w+)=(/\[[^\]]*\]/g);function (\w+)\((\w+)\)\{if\(typeof \4==="string"\)' +
          'return \4\.replace\(\1,(?=\(\w+\)=>.{0,40}codePointAt)'
    if ($wc -notmatch $rx) { Write-Miss 'bidi sanitiser not found (older extension?)'; return }

    $new = Get-InjectedJs (Join-Path $PSScriptRoot 'js\strip-marks.js') ([ordered]@{
            '__CLASS__' = '${2}'
            '__RPT__'   = '${1}'
            '__UC__'    = '${3}'
            '__E__'     = '${4}'
        })
    Write-Text $Ctx.WebJs ([regex]::Replace($wc, $rx, $new))
    Write-Ok 'bidi marks dropped instead of rendered as escape text'
}
