# Build version.dll (the fingerprint shim) from desktop/fingerprint/src.
# Needs VS Build Tools (cl.exe). The repo also ships the prebuilt version.dll,
# so installing needs no compiler; run this only to rebuild from source.
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$src = Join-Path $here "src\ccfingerprint.c"
$out = Join-Path $here "version.dll"

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $vswhere)) { Write-Error "vswhere not found (install VS Build Tools)"; exit 1 }
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { Write-Error "VC++ build tools not found"; exit 1 }

$vcvars = Join-Path $vs "VC\Auxiliary\Build\vcvars64.bat"
$cmd = "`"$vcvars`" >NUL 2>&1 && cl /nologo /LD /O2 /MT `"$src`" /Fo:`"$here\`" /Fe:`"$out`" /link psapi.lib bcrypt.lib"
cmd.exe /c $cmd
if ($LASTEXITCODE -ne 0) { Write-Error "cl build failed"; exit 1 }

Remove-Item (Join-Path $here "*.obj"),(Join-Path $here "version.exp"),(Join-Path $here "version.lib") -ErrorAction SilentlyContinue
Write-Host "built: $out"
