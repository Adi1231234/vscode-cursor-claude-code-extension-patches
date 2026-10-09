# Every lib test (lib/tests/*.test.ps1) in one PowerShell, so CI pays one
# start-up rather than one per file. Exits 1 when any of them failed. Run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File lib/tests/run.ps1
$failed = @()
foreach ($t in Get-ChildItem $PSScriptRoot -Filter '*.test.ps1' | Sort-Object Name) {
    Write-Host "--- $($t.Name)"
    $global:LASTEXITCODE = 0
    try { & $t.FullName } catch { Write-Host "FAIL  threw: $($_.Exception.Message)"; $global:LASTEXITCODE = 1 }
    if ($LASTEXITCODE) { $failed += $t.Name }
}
if ($failed) { Write-Host "`nfailed: $($failed -join ', ')"; exit 1 }
