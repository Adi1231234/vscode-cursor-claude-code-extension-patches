# lib/Io.ps1's batch: an install's bundles held in memory while the patches
# run, and written once at the end. Run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File lib/tests/io-batch.test.ps1
# Exits 1 on the first failed check.
#
#   1. a write to a held file stays in memory: the disk keeps the old text,
#      and a read returns the new one
#   2. an append to a held file lands on the held text
#   3. the save writes what changed, once, and leaves the rest untouched
#   4. once saved, nothing is held: a write goes straight to disk again
#   5. a file that cannot be written is reported, and the others still are
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\Ui.ps1')
. (Join-Path $PSScriptRoot '..\Io.ps1')

$dir = Join-Path ([IO.Path]::GetTempPath()) ("cc-batch-test-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $dir | Out-Null
$failed = 0
function Check([string]$Name, [bool]$Ok) {
    if ($Ok) { Write-Host "PASS  $Name" } else { Write-Host "FAIL  $Name"; $script:failed++ }
}
$disk = { param($p) [IO.File]::ReadAllText($p) }

try {
    $js, $css, $same = 'a.js', 'b.css', 'c.js' | ForEach-Object { Join-Path $dir $_ }
    [IO.File]::WriteAllText($js, 'one')
    [IO.File]::WriteAllText($css, 'body{}')
    [IO.File]::WriteAllText($same, 'untouched')
    $before = (Get-Item $same).LastWriteTimeUtc

    Open-TextBatch @($js, $css, $same)
    Write-Text $js 'two'
    Check 'a held write stays in memory' ((& $disk $js) -eq 'one' -and (Read-Text $js) -eq 'two')

    Add-Text $css ' p{}'
    Check 'an append lands on the held text' ((& $disk $css) -eq 'body{}' -and (Read-Text $css) -eq 'body{} p{}')

    $bad = @(Save-TextBatch)
    Check 'the save writes what changed' (-not $bad.Count -and (& $disk $js) -eq 'two' -and (& $disk $css) -eq 'body{} p{}')
    Check 'an unchanged file is not written' ((Get-Item $same).LastWriteTimeUtc -eq $before)

    Write-Text $js 'three'
    Check 'after the save, a write goes to disk' ((& $disk $js) -eq 'three')

    Open-TextBatch @($js, $css)
    Write-Text $js 'four'
    Write-Text $css 'p{}'
    Set-ItemProperty $js IsReadOnly $true
    $bad = @(Save-TextBatch)
    Check 'a file that cannot be written is reported, the rest still are' (
        $bad.Count -eq 1 -and $bad[0] -like "$js*" -and (& $disk $js) -eq 'three' -and (& $disk $css) -eq 'p{}')
    Set-ItemProperty $js IsReadOnly $false
}
finally {
    Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
}
if ($failed) { exit 1 }
