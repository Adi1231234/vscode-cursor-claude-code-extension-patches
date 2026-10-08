# Sessions started from the IDE cannot be resumed: "cannot resume into worktree".
# VS Code / Cursor derive every workspace path from a file:// URI, and URI.fsPath
# lower-cases the drive letter, so the extension launches the CLI in "c:\project".
# git reports the same directory as "C:/project", and Claude Code >= 2.1.222
# compares the two case-sensitively when it adopts an isolation worktree -> it
# refuses and the process exits 1. Fix: upper-case the drive letter on the cwd
# handed to every claude launch (the SDK query and the terminal), so the spelling
# the CLI records is the one Windows itself reports. See README.md for the proof.
#
# Two sites, two shapes. The terminal still inlines `cwd:<arg>||this.cwd,`; the
# SDK query has resolved its cwd into a variable first since at least 2.1.241 and
# hands it on as `{cwd:<var>,resume:<id>,canUseTool:` - the shape this patch
# missed for months while still reporting [ok] off the terminal site alone. The
# SDK site is the one every panel session goes through, so it is required: without
# it nothing is written. The inserted expressions live in js/*.js; their __V1__ /
# __V2__ placeholders map to the capture groups (as ${n} backrefs).
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js.Contains('/* CWDDRIVECASE */')) { Write-Skip 'already patched'; return }

    $rxSdk = '\{cwd:([\w$]+),resume:([\w$]+),canUseTool:'
    $rxTerminal = 'cwd:([\w$]+)\|\|this\.cwd,'
    $sdk = ([regex]$rxSdk).Matches($js).Count
    if ($sdk -ne 1) { Write-Miss "SDK launch cwd anchor matched $sdk times, expected 1"; return }
    $terminal = ([regex]$rxTerminal).Matches($js).Count

    $sdkExpr = (Get-InjectedJs (Join-Path $PSScriptRoot 'js\sdk-cwd-expr.js') ([ordered]@{
        '__V1__' = '${1}'; '__V2__' = '${2}'
    })).Trim()
    $js = [regex]::Replace($js, $rxSdk, $sdkExpr)
    if ($terminal -gt 0) {
        $expr = Get-InjectedJs (Join-Path $PSScriptRoot 'js\cwd-expr.js') ([ordered]@{ '__V1__' = '${1}' })
        $js = [regex]::Replace($js, $rxTerminal, $expr)
    } else {
        Write-Miss 'terminal launch cwd anchor not found (the SDK launch is still normalised)'
    }

    $helper = (Read-Text (Join-Path $PSScriptRoot 'js\drive-case.js')).Trim()
    Write-Text $Ctx.Js ("/* CWDDRIVECASE */`n" + $helper + "`n" + $js)
    Write-Ok "launch cwd normalised to the canonical drive-letter spelling (SDK query + $terminal terminal)"
}
