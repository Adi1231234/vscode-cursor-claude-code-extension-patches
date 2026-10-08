# A session that entered a worktree itself is resumed from the folder it entered
# it from, not from inside the worktree - otherwise the CLI anchors it there and
# ExitWorktree silently stops working (see README.md for the proof).
#
# One site in extension.js: the host's dispatch of the panel's launch_claude
# message, where the cwd the panel asked for is handed to launchClaude. That cwd
# goes through __ccResumeOrigin first, which reads the session's own transcript
# and returns either the same folder or the one the session came from. The host
# runtime lives in host/*.js and is prepended; the replaced call is
# js/launch-call.js, whose __M__ maps to the message variable (a ${1} backref).
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js.Contains('/* WORKTREERESUMEORIGIN */')) { Write-Skip 'already patched'; return }

    $rx = 'case"launch_claude":await this\.launchClaude\(([\w$]+)\.channelId,\1\.resume,\1\.cwd,'
    $n = ([regex]$rx).Matches($js).Count
    if ($n -ne 1) { Write-Miss "launch_claude dispatch anchor matched $n times, expected 1"; return }

    $call = (Get-InjectedJs (Join-Path $PSScriptRoot 'js/launch-call.js') @{ '__M__' = '${1}' }).Trim()
    $js = [regex]::Replace($js, $rx, $call)

    $runtime = (@('host/transcript.js', 'host/origin.js') |
        ForEach-Object { (Read-Text (Join-Path $PSScriptRoot $_)).Trim() }) -join "`n"
    Write-Text $Ctx.Js ("/* WORKTREERESUMEORIGIN */`n" + $runtime + "`n" + $js)
    Write-Ok 'resumed worktree sessions launch from the folder they entered the worktree from'
}
