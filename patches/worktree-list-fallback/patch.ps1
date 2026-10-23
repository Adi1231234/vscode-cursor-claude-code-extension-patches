# When `git worktree list` fails, the lister answers from git's own files
# instead of answering "no worktrees" (see README.md for the proof).
#
# The extension's lister (one in each of the two bundled copies of that code):
#   async function <f>(<cwd>){... "worktree","list","--porcelain"] ...
#     .map((<x>)=><map>(<x>.slice(9)))}catch{return[]}}
# Its `catch{return[]}` becomes a call to __ccWorktreesOnDisk(<cwd>, <map>, err)
# (js/catch.js), prepended once as host/on-disk.js. The path mapper is captured
# and passed in, so a path read from disk is spelled exactly like one git printed.
# Every caller of the lister in the bundle finds sessions with it (history list,
# lookup by id, resume precheck, candidate folders), so all of them get the
# fallback and nothing else changes. A lister that is reshaped is a [miss].
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js.Contains('/* WORKTREELISTFALLBACK */')) { Write-Skip 'already patched'; return }

    $rx = 'async function [\w$]+\(([\w$]+)\)\{(?:(?!function )[\s\S]){0,400}?"worktree","list","--porcelain"' +
          '(?:(?!function )[\s\S]){0,400}?\.map\(\(([\w$]+)\)=>([\w$]+)\(\2\.slice\(9\)\)\)\}(catch\{return\[\]\})\}'
    $sites = @([regex]::Matches($js, $rx))
    if ($sites.Count -eq 0) { Write-Miss 'git worktree list helper with an empty catch not found'; return }

    $catch = (Read-Text (Join-Path $PSScriptRoot 'js/catch.js')).Trim()
    # Back to front, so every recorded index still points at its own match.
    foreach ($m in ($sites | Sort-Object Index -Descending)) {
        $new = Expand-JsTokens $catch @{ '__CWD__' = $m.Groups[1].Value; '__MAP__' = $m.Groups[3].Value }
        $head = $m.Value.Substring(0, $m.Groups[4].Index - $m.Index)
        $js = Set-MatchText $js $m ($head + $new + '}')
    }

    $runtime = (Read-Text (Join-Path $PSScriptRoot 'host/on-disk.js')).Trim()
    Write-Text $Ctx.Js ("/* WORKTREELISTFALLBACK */`n" + $runtime + "`n" + $js)
    Write-Ok "a failed git worktree list is read from git's own files ($($sites.Count) lister(s))"
}
