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

    # var <rx>=/[...]/g; <anything> <recv>.replace(<rx>,(<c>)=> ... codePointAt
    #
    # Only the two ends are the site: the character class declared as a var, and
    # the one .replace() that consumes it with an escaping callback. What sits
    # between them is the app's business and is captured, not matched - it was a
    # recursive body (`function f(e){if(typeof e==="string")return `) up to
    # 2.1.268 and is a deep-map callback (`function f($){return walk($,(J)=>`)
    # from 2.1.269 on, which is exactly what the old anchor spelled out and what
    # made it stop matching there. Verified: exactly one match on every
    # win32-x64 webview bundle from 2.1.227 through 2.1.280.
    $rx = 'var ([\w$]+)=(/\[[^\]]*\]/g);(.{0,200}?)([\w$]+)\.replace\(\1,' +
          '(?=\([\w$]+\)=>.{0,60}codePointAt)'
    $hits = [regex]::Matches($wc, $rx)
    if ($hits.Count -ne 1) {
        Write-Miss "bidi sanitiser not found ($($hits.Count) matches, expected 1)"
        return
    }

    $new = Get-InjectedJs (Join-Path $PSScriptRoot 'js\strip-marks.js') ([ordered]@{
            '__CLASS__' = '${2}'
            '__RPT__'   = '${1}'
            '__MID__'   = '${3}'
            '__RECV__'  = '${4}'
        })
    Write-Text $Ctx.WebJs ([regex]::Replace($wc, $rx, $new))
    Write-Ok 'bidi marks dropped instead of rendered as escape text'
}
