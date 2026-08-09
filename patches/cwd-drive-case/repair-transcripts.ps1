# One-off repair for transcripts written before the cwd-drive-case patch.
#
# Sessions that entered an isolation worktree from the IDE recorded their paths
# with the lower-cased drive letter VS Code / Cursor hand out, which Claude Code
# >= 2.1.222 refuses to resume (see README.md). This rewrites the drive letter in
# the worktree-state records, and nothing else: every other line is left byte for
# byte as it was. Not run by apply.ps1 - this touches session history, not the
# extension.
[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$ProjectsRoot = (Join-Path $env:USERPROFILE '.claude\projects'),
    [string[]]$SkipSessionId = @(),
    [switch]$NoBackup
)

. (Join-Path $PSScriptRoot '..\..\lib\Io.ps1')
. (Join-Path $PSScriptRoot '..\..\lib\Ui.ps1')

$marker = '"type":"worktree-state"'
$rx = [regex]'"(originalCwd|preEnterOriginalCwd|worktreePath)":"([a-z]):'
$upper = [System.Text.RegularExpressions.MatchEvaluator] {
    param($m)
    '"' + $m.Groups[1].Value + '":"' + $m.Groups[2].Value.ToUpperInvariant() + ':'
}

Write-Head "Repairing worktree paths under $ProjectsRoot"
Write-Info 'Close other Claude Code windows first: a transcript is rewritten whole,'
Write-Info 'so lines a live session appends mid-run would be lost.'
if (-not (Test-Path $ProjectsRoot)) { Write-Miss 'projects directory not found'; return }
$skip = [System.Collections.Generic.HashSet[string]]::new([string[]]$SkipSessionId, [System.StringComparer]::OrdinalIgnoreCase)

$backup = Join-Path ([System.IO.Path]::GetTempPath()) ("claude-transcripts-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$files = 0
$records = 0

foreach ($file in Get-ChildItem -Path $ProjectsRoot -Filter *.jsonl -Recurse -File) {
    if ($skip.Contains($file.BaseName)) { Write-Skip "$($file.BaseName) (live session)"; continue }
    $text = Read-Text $file.FullName
    if (-not $text.Contains($marker)) { continue }

    $hits = 0
    $lines = $text -split "`n"
    for ($i = 0; $i -lt $lines.Length; $i++) {
        if (-not $lines[$i].Contains($marker)) { continue }
        $fixed = $rx.Replace($lines[$i], $upper)
        # -cne, not -ne: PowerShell's default comparisons are case-insensitive, and
        # case is the only thing this rewrite changes.
        if ($fixed -cne $lines[$i]) { $lines[$i] = $fixed; $hits++ }
    }
    if ($hits -eq 0) { continue }

    $files++
    $records += $hits
    $relative = $file.FullName.Substring($ProjectsRoot.Length).TrimStart('\')
    if (-not $PSCmdlet.ShouldProcess($relative, "rewrite $hits worktree record(s)")) { continue }

    if (-not $NoBackup) {
        $target = Join-Path $backup $relative
        New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
        Write-Text $target $text
    }
    Write-Text $file.FullName ($lines -join "`n")
    Write-Ok "$relative ($hits record(s))"
}

if ($files -eq 0) { Write-Skip 'nothing to repair'; return }
Write-Info "$records record(s) across $files transcript(s)"
if (-not $NoBackup -and $PSCmdlet.ShouldProcess('backup', 'report')) { Write-Info "originals copied to $backup" }
