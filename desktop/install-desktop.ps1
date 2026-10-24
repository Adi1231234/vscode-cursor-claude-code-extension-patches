# Install / update the patched Claude Desktop app, in one command.
#
# Fetches the latest release, extracts its Electron app, patches it, and places
# the fingerprint shim (version.dll) beside the exe - a self-contained patched
# copy under %LOCALAPPDATA%\claude-code-patches\app that the Store build never
# touches. Re-running updates it to the newest release. Idempotent: nothing
# happens when already on the latest. Scheduling is an Adi Tools task that calls
# the bootstrap with -Scope desktop, not a Windows scheduled task.
[CmdletBinding()]
param(
    [switch]$Force        # re-patch even when already on the latest version
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
. (Join-Path $root "install\Msix.ps1")
. (Join-Path $root "install\Shortcut.ps1")

$home_ = Join-Path $env:LOCALAPPDATA "claude-code-patches"
$appDir = Join-Path $home_ "app"
$marker = Join-Path $home_ "installed.json"
$dll = Join-Path $root "fingerprint\version.dll"
$exe = Join-Path $appDir "claude.exe"
if (-not (Test-Path $dll)) { Write-Error "missing fingerprint\version.dll (run desktop\fingerprint\build.ps1)"; exit 1 }

Write-Host "Claude Desktop patch installer"
$latest = Get-LatestMsix
Write-Host "  latest release: $($latest.Version)"

$have = $null
if (Test-Path $marker) { try { $have = Get-Content $marker -Raw | ConvertFrom-Json } catch {} }
$patched = (Test-Path $exe) -and (Select-String -Path (Join-Path $appDir "resources\app.asar") -Pattern "CCDESK" -Quiet -ErrorAction SilentlyContinue)
if (-not $Force -and $have -and $have.version -eq $latest.Version -and $patched) {
    Write-Host "  already on $($latest.Version), patched. nothing to do."
    exit 0
}

# A patched-copy instance would lock its files; the Store build (WindowsApps)
# does not, so only our own copy's processes matter.
$running = Get-Process claude -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe }
if ($running) {
    Write-Host "  the patched Claude is open - close it and re-run (your Store Claude is unaffected)."
    exit 2
}

Write-Host "  fetching and extracting the app..."
$n = Save-MsixApp $latest.Url $appDir
Write-Host "  $n files extracted -> $appDir"

Write-Host "  patching..."
& (Join-Path $root "apply.ps1") -InstallDir $appDir
if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { Write-Error "apply.ps1 failed"; exit 1 }

Copy-Item $dll (Join-Path $appDir "version.dll") -Force
Write-Host "  fingerprint shim placed."

$lnk = New-PatchedShortcut $exe "Claude (patched)"
Write-Host "  shortcut: $lnk"

@{ version = $latest.Version; url = $latest.Url; patchedAt = (Get-Date).ToString("o") } |
    ConvertTo-Json | Set-Content -Encoding UTF8 $marker

Write-Host ""
Write-Host "Done. Launch 'Claude (patched)' from the Start menu."
