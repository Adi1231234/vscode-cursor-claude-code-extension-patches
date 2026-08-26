# Worktree session TITLE written to the wrong project dir (session opens empty).
# renameSession() writes the title to the MAIN repo dir, but the transcript lives
# under the WORKTREE dir - creating a title-only phantom that shadows the real
# transcript. Fix: resolve <sid>.jsonl to the dir that actually holds it (largest
# file). Uses the shared __ccWtResolve helper. The inserted call lives in
# resolve-title.js; its __TOKEN__ placeholders map to the regex capture groups.
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js.Contains('/* WTTITLEFIX */')) { Write-Skip 'already patched'; return }

    $rx = 'async renameSession\(([\w$]+),([\w$]+),([\w$]+)\)\{let ([\w$]+)=([\w$]+)\(this\.projectRoot\),([\w$]+)=([\w$]+)\.join\(\4,`\$\{\1\}\.jsonl`\);'
    if ($js -notmatch $rx) { Write-Miss 'renameSession anchor not found'; return }

    $new = Get-InjectedJs (Join-Path $PSScriptRoot 'resolve-title.js') ([ordered]@{ '__PATH__' = '${6}'; '__SID__' = '${1}' })
    $js = [regex]::Replace($js, $rx, '$&' + $new)
    $js = Add-CcWtResolveHelper $js
    Write-Text $Ctx.Js ("/* WTTITLEFIX */`n" + $js)
    Write-Ok 'title write resolved to the real transcript dir'
}
