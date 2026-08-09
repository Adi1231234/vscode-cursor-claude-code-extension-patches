# Sessions started from the IDE cannot be resumed: "cannot resume into worktree".
# VS Code / Cursor derive every workspace path from a file:// URI, and URI.fsPath
# lower-cases the drive letter, so the extension launches the CLI in "c:\project".
# git reports the same directory as "C:/project", and Claude Code >= 2.1.222
# compares the two case-sensitively when it adopts an isolation worktree -> it
# refuses and the process exits 1. Fix: upper-case the drive letter on the cwd
# handed to every claude launch (the SDK query and the terminal), so the spelling
# the CLI records is the one Windows itself reports. See README.md for the proof.
# The inserted expression lives in js/cwd-expr.js; its __V1__ placeholder maps to
# the regex capture group (as a ${1} backref), so the argument keeps its name.
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js.Contains('/* CWDDRIVECASE */')) { Write-Skip 'already patched'; return }

    $rx = 'cwd:(\w+)\|\|this\.cwd,'
    if ($js -notmatch $rx) { Write-Miss 'launch cwd anchor not found'; return }
    $sites = ([regex]$rx).Matches($js).Count

    $expr = Get-InjectedJs (Join-Path $PSScriptRoot 'js\cwd-expr.js') ([ordered]@{ '__V1__' = '${1}' })
    $js = [regex]::Replace($js, $rx, $expr)

    $helper = (Read-Text (Join-Path $PSScriptRoot 'js\drive-case.js')).Trim()
    Write-Text $Ctx.Js ("/* CWDDRIVECASE */`n" + $helper + "`n" + $js)
    Write-Ok "launch cwd normalised to the canonical drive-letter spelling ($sites sites)"
}
