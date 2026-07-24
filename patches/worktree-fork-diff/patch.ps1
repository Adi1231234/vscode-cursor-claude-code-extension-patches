# Worktree session FORK / inline-diff "Session not found".
# forkSession() and the diff view call ensureSessionLoaded(sid), which reads only
# the MAIN dir -> a worktree session loads nothing -> throws. Fork also re-reads
# the original for its file-history (checkpoint) data via the same wrong path. Fix:
# resolve the session file across worktree dirs in both places (shared __ccWtResolve).
# The two inserted expressions live in js/*.js; their __Vn__ placeholders map to the
# regex capture groups (as ${n} backrefs), so the injected bytes are unchanged.
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js.Contains('/* WTFORKFIX */')) { Write-Skip 'already patched'; return }
    $dir = Join-Path $PSScriptRoot 'js'

    $esRx = '(async ensureSessionLoaded\((\w)\)\{if\(this\.loadedSessions\.has\(\2\)\)return;let \w=\w+\(this\.projectRoot\),)(\w)=(\w+\.join\(\w+,`\$\{\2\}\.jsonl`\))'
    if ($js -notmatch $esRx) { Write-Miss 'ensureSessionLoaded anchor not found'; return }
    $ensure = Get-InjectedJs (Join-Path $dir 'resolve-ensure.js') ([ordered]@{ '__V3__' = '${3}'; '__V2__' = '${2}'; '__V4__' = '${4}' })
    $js = [regex]::Replace($js, $esRx, '${1}' + $ensure)

    # fork's second read for file-history (anchor on the fork-unique `,d=new Map,p=[]`)
    $fhRx = '(\w)=((\w+)\.join\(\w+,`\$\{(\w)\}\.jsonl`\)),d=new Map,p=\[\]'
    $forkHist = Get-InjectedJs (Join-Path $dir 'resolve-forkhistory.js') ([ordered]@{ '__V1__' = '${1}'; '__V4__' = '${4}'; '__V2__' = '${2}' })
    $js = [regex]::Replace($js, $fhRx, $forkHist)

    $js = Add-CcWtResolveHelper $js
    Write-Text $Ctx.Js ("/* WTFORKFIX */`n" + $js)
    Write-Ok 'fork/diff session load resolved across worktree dirs'
}
