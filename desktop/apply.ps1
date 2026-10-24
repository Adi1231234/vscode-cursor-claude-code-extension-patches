[CmdletBinding()]
param(
    [string]$InstallDir,          # a specific app-<version> folder; else newest is used
    [string]$Marker = "CCDESK",
    [string[]]$Skip = @()
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Find-AppFolder($override) {
    if ($override) { return $override }
    $base = Join-Path $env:LOCALAPPDATA "AnthropicClaude"
    if (-not (Test-Path $base)) { return $null }
    $apps = Get-ChildItem $base -Directory -Filter "app-*"
    $best = $null; $bestV = $null
    foreach ($a in $apps) {
        $v = $null
        if ([version]::TryParse(($a.Name -replace '^app-', ''), [ref]$v)) {
            if (-not $bestV -or $v -gt $bestV) { $bestV = $v; $best = $a }
        }
    }
    if ($best) { return $best.FullName }
    if ($apps) { return ($apps | Sort-Object Name)[-1].FullName }
    return $null
}

$app = Find-AppFolder $InstallDir
if (-not $app) { Write-Error "Claude Desktop (regular install) not found under %LOCALAPPDATA%\AnthropicClaude"; exit 1 }
$asar = Join-Path $app "resources\app.asar"
if (-not (Test-Path $asar)) { Write-Error "app.asar not found at $asar"; exit 1 }
Write-Host "install: $app"

# The payloads are assembled by tools/build.cjs (patch order: patches/order.json).
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) "ccd-inject"
$node = (Get-Command node).Source
& $node (Join-Path $root "tools\build.cjs") $asar $tmp ($Skip -join ",")
if ($LASTEXITCODE -ne 0) { Write-Error "payload build failed"; exit 1 }
$rf = Join-Path $tmp "renderer.js"
$mf = Join-Path $tmp "main.js"
if (-not (Test-Path $mf)) { $mf = "-" }

& $node (Join-Path $root "tools\inject-cli.cjs") $asar $rf $mf $Marker
Write-Host ""
Write-Host "Payloads injected. The fingerprint/launch step is left to you: app.asar no longer"
Write-Host "matches the hash in claude.exe, so the app refuses to launch until that is applied."
