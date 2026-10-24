[CmdletBinding()]
param(
    [string]$InstallDir,          # a specific app-<version> folder; else newest is used
    [string]$Marker = "CCDESK",
    [string[]]$Skip = @()
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
function ReadText($p) { [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8) }
function WriteText($p, $s) { [System.IO.File]::WriteAllText($p, $s, $utf8) }

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

# Order matters only for the renderer chain (zoom first, then the queue chain).
$order = @("zoom", "message-bidi", "input-usage", "mcp-reconnect-all", "prompt-queue", "phone-queue")

$stamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mmZ")
$parentLib = Join-Path $root "..\lib\js"
$rendererParts = @()
$rendererParts += (ReadText (Join-Path $root "lib\js\boot.js")).Replace("__CCD_VERSION__", $stamp)
$rendererParts += ReadText (Join-Path $parentLib "ccDom.js")
$rendererParts += ReadText (Join-Path $parentLib "ccWatch.js")
$mainParts = @()

function Add-Fragments($patchDir, $kind, [ref]$parts) {
    $orderFile = Join-Path $patchDir "$kind.order"
    $single = Join-Path $patchDir "$kind.js"
    if (Test-Path $orderFile) {
        foreach ($line in Get-Content $orderFile) {
            $t = $line.Trim()
            if ($t -and -not $t.StartsWith("#")) {
                $f = Join-Path $patchDir $t
                if (Test-Path $f) { $parts.Value += ReadText $f } else { Write-Warning "missing fragment: $f" }
            }
        }
    } elseif (Test-Path $single) {
        $parts.Value += ReadText $single
    }
}

foreach ($name in $order) {
    if ($Skip -contains $name) { continue }
    $dir = Join-Path $root "patches\$name"
    if (-not (Test-Path $dir)) { continue }
    Add-Fragments $dir "renderer" ([ref]$rendererParts)
    Add-Fragments $dir "main" ([ref]$mainParts)
    Write-Host "  + $name"
}

$sep = [string]([char]10) + ";" + [char]10
$rendererPayload = ($rendererParts -join $sep)
$mainPayload = ($mainParts -join $sep)

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) "ccd-inject"
New-Item -ItemType Directory -Force $tmp | Out-Null
$rf = Join-Path $tmp "renderer.js"; WriteText $rf $rendererPayload
$mf = "-"
if ($mainPayload.Trim()) { $mf = Join-Path $tmp "main.js"; WriteText $mf $mainPayload }

$node = (Get-Command node).Source
& $node (Join-Path $root "tools\inject-cli.cjs") $asar $rf $mf $Marker
Write-Host ""
Write-Host "Payloads injected. The fingerprint/launch step is left to you: app.asar no longer"
Write-Host "matches the hash in claude.exe, so the app refuses to launch until that is applied."
