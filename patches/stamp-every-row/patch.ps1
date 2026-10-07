# Stamp every row - the app's own message time on every row of a reply: each
# tool call and each thinking block, not only the text.
#
# The app already renders its stamp component on every assistant row; the
# component returns nothing unless the row passes one predicate (a user prompt,
# or an assistant row holding text). That predicate gains one early answer: an
# assistant row holding any other block (tool_use, thinking) is stamped too.
# The stamp, its format (the timeFormat setting), its hover and its look stay
# the app's own.
function Invoke-Patch {
    param($Ctx)

    if (-not (Test-Path $Ctx.WebJs)) { Write-Miss 'webview/index.js not found'; return }
    $wc = Read-Text $Ctx.WebJs
    if ($wc.Contains('/* STAMPEVERYROW */')) { Write-Skip 'already patched'; return }

    # The time getter names the predicate: it refuses a row the predicate
    # refuses, then a row still streaming.
    $rxTime = 'function [\w$]+\(([\w$]+)\)\{if\(!([\w$]+)\(\1\)\|\|\1\.content\.some\(\(([\w$]+)\)=>\3\.isPartial\)'
    $mTime = [regex]::Match($wc, $rxTime)
    if (-not $mTime.Success) { Write-Miss 'message-time getter not found'; return }

    $rxPred = 'function ' + [regex]::Escape($mTime.Groups[2].Value) + '\(([\w$]+)\)\{'
    $mPred = [regex]::Match($wc, $rxPred)
    if (-not $mPred.Success) { Write-Miss 'message-time predicate not found'; return }

    $early = (Get-InjectedJs (Join-Path $PSScriptRoot 'every-row.js') @{ '__MSG__' = $mPred.Groups[1].Value }).Trim()
    $at = $mPred.Index + $mPred.Length
    Write-Text $Ctx.WebJs ($wc.Substring(0, $at) + $early + "`n" + $wc.Substring($at))
    Write-Ok "every reply row stamped (predicate: $($mTime.Groups[2].Value))"
}
