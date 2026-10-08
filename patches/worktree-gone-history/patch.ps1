# Sessions whose worktree was deleted while they were still inside it stay in
# the history list, and stay openable (see README.md for the proof).
#
# The extension finds sessions by asking git for the repo's worktrees and looking
# in their projects folders. Each place that does so for *finding sessions* gets
# git's answer passed through __ccGoneWorktrees, which adds the worktrees whose
# folders are still in ~/.claude/projects but which git no longer lists. Three
# shapes of call site, in each of the two bundled copies of that code:
#   history list  - `if(J)try{K=await <list>(W)}catch{K=[]}else K=[];if(K.length<=1)return`
#   lookup        - `for(let Y of await <list>($)){if(Y===$)continue;` (load by id, resume precheck)
#   candidates    - `try{z=await <list>(Q)}catch{z=[]}for(let G of z){if(G===Q)continue;`
# Only calls of a function that runs `git worktree list --porcelain` are touched.
# The one other caller - the check that a path really is a registered worktree
# before trusting it - has none of these shapes and is deliberately left alone.
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js.Contains('/* WORKTREEGONEHISTORY */')) { Write-Skip 'already patched'; return }

    $listers = @([regex]::Matches($js,
        'async function ([\w$]+)\([\w$]+\)\{(?:(?!function )[\s\S]){0,300}?"worktree","list","--porcelain"') |
        ForEach-Object { $_.Groups[1].Value })
    if ($listers.Count -eq 0) { Write-Miss 'git worktree list helper not found'; return }

    $shapes = @(
        @{ Name = 'history list'; F = 3; A = 4
           Rx = 'if\(([\w$]+)\)try\{([\w$]+)=await ([\w$]+)\(([\w$]+)\)\}catch\{\2=\[\]\}else \2=\[\];if\(\2\.length<=1\)return' },
        @{ Name = 'lookup'; F = 2; A = 3
           Rx = 'for\(let ([\w$]+) of await ([\w$]+)\(([\w$]+)\)\)\{if\(\1===\3\)continue;' },
        @{ Name = 'candidates'; F = 2; A = 3
           Rx = 'try\{([\w$]+)=await ([\w$]+)\(([\w$]+)\)\}catch\{\1=\[\]\}for\(let ([\w$]+) of \1\)\{if\(\4===\3\)continue;' }
    )
    $sites = @()
    foreach ($s in $shapes) {
        foreach ($m in [regex]::Matches($js, $s.Rx)) {
            $f = $m.Groups[$s.F].Value
            if ($listers -notcontains $f) { continue }
            $sites += [pscustomobject]@{ Shape = $s.Name; Index = $m.Index; Text = $m.Value; F = $f; A = $m.Groups[$s.A].Value }
        }
    }
    $per = $shapes | ForEach-Object { $n = $_.Name; "$n x$(@($sites | Where-Object Shape -eq $n).Count)" }
    if (@($sites | Where-Object Shape -eq 'history list').Count -eq 0 -or @($sites | Where-Object Shape -eq 'lookup').Count -eq 0) {
        Write-Miss "session lookup sites not found ($($per -join ', '))"; return
    }

    # Back to front, so every recorded index still points at its own match.
    $wrap = (Read-Text (Join-Path $PSScriptRoot 'js/wrap.js')).Trim()
    foreach ($site in ($sites | Sort-Object Index -Descending)) {
        $call = "await $($site.F)($($site.A))"
        $at = $site.Text.IndexOf($call)
        $new = Expand-JsTokens $wrap @{ '__F__' = $site.F; '__A__' = $site.A }
        $text = $site.Text.Substring(0, $at) + $new + $site.Text.Substring($at + $call.Length)
        $js = $js.Substring(0, $site.Index) + $text + $js.Substring($site.Index + $site.Text.Length)
    }

    $runtime = (@((Get-LibJsPath 'ccProjects.js'), (Join-Path $PSScriptRoot 'host/gone.js')) |
        ForEach-Object { (Read-Text $_).Trim() }) -join "`n"
    Write-Text $Ctx.Js ("/* WORKTREEGONEHISTORY */`n" + $runtime + "`n" + $js)
    Write-Ok "sessions of deleted worktrees stay findable ($($per -join ', '))"
}
