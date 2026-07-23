# Worktree session FORK / inline-diff "Session not found".
# forkSession() and the diff view call ensureSessionLoaded(sid), which reads only
# the MAIN dir -> a worktree session loads nothing -> throws. Fork also re-reads
# the original for its file-history (checkpoint) data via the same wrong path. Fix:
# resolve the session file across worktree dirs in both places (shared __ccWtResolve).
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js.Contains('/* WTFORKFIX */')) { Write-Skip 'already patched'; return }

    $esRx = '(async ensureSessionLoaded\((\w)\)\{if\(this\.loadedSessions\.has\(\2\)\)return;let \w=\w+\(this\.projectRoot\),)(\w)=(\w+\.join\(\w+,`\$\{\2\}\.jsonl`\))'
    if ($js -notmatch $esRx) { Write-Miss 'ensureSessionLoaded anchor not found'; return }

    $js = [regex]::Replace($js, $esRx, '${1}${3}=await globalThis.__ccWtResolve(${2},${4})')
    # fork's second read for file-history (anchor on the fork-unique `,d=new Map,p=[]`)
    $fhRx = '(\w)=((\w+)\.join\(\w+,`\$\{(\w)\}\.jsonl`\)),d=new Map,p=\[\]'
    $js = [regex]::Replace($js, $fhRx, '${1}=await globalThis.__ccWtResolve(${4},${2}),d=new Map,p=[]')
    $js = Add-CcWtResolveHelper $js
    Write-Text $Ctx.Js ("/* WTFORKFIX */`n" + $js)
    Write-Ok 'fork/diff session load resolved across worktree dirs'
}
