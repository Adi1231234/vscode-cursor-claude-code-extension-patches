# One-off recovery for sessions stranded before this patch (see README.md).
#
# A session that was anchored in its worktree and then deleted it left its
# transcript in ~/.claude/projects/<repo>--claude-worktrees-<name>/, a folder the
# panel no longer looks in. This moves each such transcript (and its sibling
# folder of subagent logs and tool results) into the projects folder of the
# directory the session entered the worktree from - where ExitWorktree would
# have put it - and appends one {"type":"relocated"} record naming that
# directory, the same record the CLI writes when a session moves. The panel then
# lists it again and resumes it there instead of in the deleted worktree.
#
# A transcript counts as stranded only when the worktree it names is gone. Not
# run by apply.ps1 - this touches session history, not the extension. Close the
# sessions first: a transcript a live session is still writing must not move.
[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$ProjectsRoot = (Join-Path $(if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $env:USERPROFILE '.claude' }) 'projects'),
    [string[]]$SessionId = @(),
    [switch]$NoBackup
)

. (Join-Path $PSScriptRoot '..\..\lib\Io.ps1')
. (Join-Path $PSScriptRoot '..\..\lib\Ui.ps1')

# `powershell -File` hands "-SessionId a,b" over as one string, not two.
$SessionId = @($SessionId | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

# The newest value of one field across the records of one type, read from the end.
function Get-LastRecordValue {
    param([string[]]$Lines, [string]$Type, [string[]]$Fields)
    for ($i = $Lines.Length - 1; $i -ge 0; $i--) {
        if (-not $Lines[$i].Contains("`"type`":`"$Type`"")) { continue }
        try { $rec = $Lines[$i] | ConvertFrom-Json } catch { continue }
        $src = if ($Type -eq 'worktree-state') { $rec.worktreeSession } else { $rec }
        if ($null -eq $src) { continue }
        foreach ($f in $Fields) { if ($src.$f) { return [string]$src.$f } }
    }
    return $null
}

# A folder a session can be resumed in: it exists, and if it is a worktree,
# git's link file is still in it (a removed worktree can leave its folder behind).
$worktreeTail = '[\\/]\.claude[\\/]worktrees[\\/][^\\/]+[\\/]?$'
function Test-LiveDir {
    param([string]$Path)
    if (-not (Test-Path $Path -PathType Container)) { return $false }
    if ($Path -notmatch $worktreeTail) { return $true }
    Test-Path (Join-Path $Path '.git')
}

Write-Head "Looking for stranded worktree sessions under $ProjectsRoot"
if (-not (Test-Path $ProjectsRoot)) { Write-Miss 'projects directory not found'; return }
$backup = Join-Path ([System.IO.Path]::GetTempPath()) ("claude-stranded-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$found = 0
$moved = 0

foreach ($dir in Get-ChildItem -Path $ProjectsRoot -Directory) {
    if ($dir.Name -notmatch '--claude-worktrees-[^\\]+$') { continue }
    foreach ($file in Get-ChildItem -Path $dir.FullName -Filter *.jsonl -File) {
        $id = $file.BaseName
        if ($SessionId.Count -and $SessionId -notcontains $id) { continue }
        $lines = (Read-Text $file.FullName) -split "`n"
        # Where the session is now: the CLI re-writes this record on every flush.
        $here = Get-LastRecordValue $lines 'relocated' @('relocatedCwd')
        if (-not $here) { $here = Get-LastRecordValue $lines 'worktree-state' @('worktreePath') }
        if (-not $here -or (Test-LiveDir $here)) { continue }

        $origin = @((Get-LastRecordValue $lines 'worktree-state' @('preEnterOriginalCwd')),
                    (Get-LastRecordValue $lines 'worktree-state' @('originalCwd')),
                    ($here -replace $worktreeTail, '')) |
            Where-Object { $_ -and (Test-LiveDir $_) } | Select-Object -First 1
        if (-not $origin) { Write-Miss "$id - every folder it came from is gone too"; continue }
        # The folder the CLI keys a directory by: every non-alphanumeric becomes
        # "-". Past 200 characters it truncates and hashes, which is not guessed.
        $key = $origin -replace '[^a-zA-Z0-9]', '-'
        if ($key.Length -gt 200) { Write-Miss "$id - origin path too long to key safely"; continue }
        $mainDir = Join-Path $ProjectsRoot $key
        $target = Join-Path $mainDir $file.Name
        if (Test-Path $target) { Write-Miss "$id - $target already exists"; continue }
        $found++
        if (-not $PSCmdlet.ShouldProcess($id, "move to $mainDir and resume in $origin")) { continue }

        $sibling = Join-Path $dir.FullName $id
        if (-not $NoBackup) {
            New-Item -ItemType Directory -Force -Path (Join-Path $backup $dir.Name) | Out-Null
            Copy-Item $file.FullName (Join-Path $backup $dir.Name)
            if (Test-Path $sibling) { Copy-Item $sibling (Join-Path $backup $dir.Name) -Recurse }
        }
        New-Item -ItemType Directory -Force -Path $mainDir | Out-Null
        Move-Item $file.FullName $target
        if (Test-Path $sibling) { Move-Item $sibling (Join-Path $mainDir $id) }
        $record = [ordered]@{ type = 'relocated'; relocatedCwd = $origin; sessionId = $id } | ConvertTo-Json -Compress
        $lead = if ($lines[-1] -eq '') { '' } else { "`n" }
        Add-Text $target ($lead + $record + "`n")
        Write-Ok "$id -> $(Split-Path $mainDir -Leaf), resumes in $origin"
        $moved++
    }
}

if ($found -eq 0) { Write-Skip 'nothing stranded'; return }
if ($moved -eq 0) { Write-Info "$found stranded, nothing moved"; return }
if (-not $NoBackup) { Write-Info "originals copied to $backup" }
