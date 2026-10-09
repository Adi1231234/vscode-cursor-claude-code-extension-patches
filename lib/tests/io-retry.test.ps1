# lib/Io.ps1 against a file another process holds. Run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File lib/tests/io-retry.test.ps1
# Exits 1 on the first failed check.
#
#   1. a lock released after ~0.6 s: the write waits it out and lands
#   2. a lock that outlasts the retries: the write fails, as before, with the
#      sharing violation
#   3. an error that is not a lock (no such folder): fails at once, no waiting
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\Ui.ps1')
. (Join-Path $PSScriptRoot '..\Io.ps1')

$dir = Join-Path ([IO.Path]::GetTempPath()) ("cc-io-test-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $dir | Out-Null
$failed = 0
function Check([string]$Name, [bool]$Ok, [string]$Detail) {
    if ($Ok) { Write-Host "PASS  $Name  $Detail" } else { Write-Host "FAIL  $Name  $Detail"; $script:failed++ }
}

# Holds $Path with no sharing for $Ms, from another process; returns once held.
function Hold([string]$Path, [int]$Ms) {
    $flag = "$Path.held"
    $code = "`$f = [IO.File]::Open('$Path', 'OpenOrCreate', 'ReadWrite', 'None'); " +
            "[IO.File]::WriteAllText('$flag', 'x'); Start-Sleep -Milliseconds $Ms; `$f.Close()"
    $p = Start-Process powershell.exe -ArgumentList '-NoProfile', '-Command', $code -PassThru -WindowStyle Hidden
    while (-not (Test-Path $flag)) { Start-Sleep -Milliseconds 20 }
    return $p
}

try {
    $f1 = Join-Path $dir 'brief.txt'
    $p = Hold $f1 600
    $t = [Diagnostics.Stopwatch]::StartNew()
    Write-Text $f1 'landed'
    $ms = $t.ElapsedMilliseconds
    $p.WaitForExit()
    Check 'a brief lock is waited out' ((Read-Text $f1) -eq 'landed' -and $ms -ge 300) "($ms ms)"

    $f2 = Join-Path $dir 'held.txt'
    $p = Hold $f2 15000
    $t = [Diagnostics.Stopwatch]::StartNew()
    $err = $null
    try { Write-Text $f2 'never' } catch { $err = $_ }
    $ms = $t.ElapsedMilliseconds
    $p.Kill()
    Check 'a lasting lock still fails' ($err -and "$err" -match 'being used by another process' -and $ms -ge 2000) "($ms ms)"

    $t = [Diagnostics.Stopwatch]::StartNew()
    $err = $null
    try { Write-Text (Join-Path $dir 'no\such\folder\x.txt') 'x' } catch { $err = $_ }
    $ms = $t.ElapsedMilliseconds
    Check 'any other error is not retried' ($err -and $ms -lt 200) "($ms ms)"
}
finally {
    Start-Sleep -Milliseconds 300
    Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
}
if ($failed) { exit 1 }
