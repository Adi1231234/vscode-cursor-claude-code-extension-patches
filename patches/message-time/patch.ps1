# Message time - the app's own message time on every row, under it, on the
# left (the way a chat app shows it), in the format the timeFormat setting
# gives ("%H:%M:%S" for 24-hour with seconds; a setting, not a patch).
#
#   (1) webview/index.js: the app renders its stamp component on every assistant
#       row and then asks one predicate whether the row is a message (a prompt,
#       or a reply holding text). That predicate gains one early answer: a reply
#       row holding any other block (tool_use, thinking) is stamped too.
#   (2) webview/index.js: since 2.1.292 a run of Read calls is folded into one
#       synthetic row ("Read N files") built with no createdAt; it gets the time
#       of the first read it folds. A bundle that folds nothing has nothing to fix.
#   (3) webview/index.css: the stamp moves from above the row to under it, left.
# The stamp, its hover, its switch and its format stay the app's own.
function Invoke-Patch {
    param($Ctx)

    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'message-time.css') '/* MESSAGETIMECSS */' 'message-time CSS'

    if (-not (Test-Path $Ctx.WebJs)) { Write-Miss 'webview/index.js not found'; return }
    $wc = Read-Text $Ctx.WebJs
    if ($wc.Contains('/* MESSAGETIME */')) { Write-Skip 'already patched'; return }

    # The time getter names the predicate: it refuses a row the predicate
    # refuses, then a row still streaming.
    $rxTime = 'function [\w$]+\(([\w$]+)\)\{if\(!([\w$]+)\(\1\)\|\|\1\.content\.some\(\(([\w$]+)\)=>\3\.isPartial\)'
    $mTime = [regex]::Match($wc, $rxTime)
    if (-not $mTime.Success) { Write-Miss 'message-time getter not found'; return }

    $rxPred = 'function ' + [regex]::Escape($mTime.Groups[2].Value) + '\(([\w$]+)\)\{'
    $mPred = [regex]::Match($wc, $rxPred)
    if (-not $mPred.Success) { Write-Miss 'message-time predicate not found'; return }

    # The folded reads row: the constructor call right after its own
    # "Successfully read" result, its source rows captured.
    $rxFold = 'Successfully read [\s\S]{0,400}?new [\w$]+\("assistant",[\w$]+,\{uuid:void 0,hiddenFromChat:([\w$]+)\[0\]\.hiddenFromChat(?=\})'
    $mFold = [regex]::Match($wc, $rxFold)
    if ($wc.Contains('Successfully read ') -and -not $mFold.Success) { Write-Miss 'folded reads row anchor not found'; return }

    # Back to front, so the first edit does not move the second's offset.
    $edits = @(@{ At = $mPred.Index + $mPred.Length
                  Text = (Get-InjectedJs (Join-Path $PSScriptRoot 'every-row.js') @{ '__MSG__' = $mPred.Groups[1].Value }).Trim() + "`n" })
    if ($mFold.Success) {
        $edits += @{ At = $mFold.Index + $mFold.Length
                     Text = (Get-InjectedJs (Join-Path $PSScriptRoot 'merged-reads.js') @{ '__ROWS__' = $mFold.Groups[1].Value }).Trim() }
    }
    foreach ($e in ($edits | Sort-Object { $_.At } -Descending)) {
        $wc = $wc.Substring(0, $e.At) + $e.Text + $wc.Substring($e.At)
    }
    Write-Text $Ctx.WebJs $wc
    Write-Ok "every reply row stamped (predicate: $($mTime.Groups[2].Value))"
    if ($mFold.Success) { Write-Ok 'folded reads row carries its first read''s time' }
    else { Write-Info 'this version folds no reads' }
}
