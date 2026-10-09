# lib/Regression.ps1: a run never writes an install with fewer working patches
# than it found. Run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File lib/tests/regression.test.ps1
# Exits 1 when a check failed.
#
#   1. the guard map holds only the patches the run applies
#   2. the guards an install carries are read from the held copy
#   3. a run that drops an installed patch writes nothing and names the patch
#   4. a run that keeps every installed patch is written
#   5. a fresh install with nothing on it takes a partial run
#   6. a patch left out of the run is not counted as lost
$ErrorActionPreference = 'Stop'
foreach ($f in 'Ui', 'Io', 'Pristine', 'Regression') { . (Join-Path $PSScriptRoot "..\$f.ps1") }

$dir = Join-Path ([IO.Path]::GetTempPath()) ("cc-regression-test-" + [guid]::NewGuid().ToString('N'))
$failed = 0
function Check([string]$Name, [bool]$Ok) {
    if ($Ok) { Write-Host "PASS  $Name" } else { Write-Host "FAIL  $Name"; $script:failed++ }
}
$disk = { param($p) [IO.File]::ReadAllText($p) }

try {
    foreach ($p in 'alpha', 'beta') {
        New-Item -ItemType Directory (Join-Path $dir "patches\$p") -Force | Out-Null
        $guard = "/* $($p.ToUpper()) */"
        [IO.File]::WriteAllText((Join-Path $dir "patches\$p\patch.ps1"), "Add-StyleBlock `$Ctx 'x.css' '$guard' 'label'")
    }
    $Ctx = @{ Js = (Join-Path $dir 'extension.js'); WebJs = (Join-Path $dir 'index.js'); Css = (Join-Path $dir 'index.css') }
    $map = Get-PatchGuardMap (Join-Path $dir 'patches') @('alpha', 'beta')
    $alphaOnly = Get-PatchGuardMap (Join-Path $dir 'patches') @('alpha')
    Check 'the guard map holds only the patches the run applies' (
        $map.Count -eq 2 -and $map['/* BETA */'] -eq 'beta' -and $alphaOnly.Count -eq 1)

    $patched = 'app /* ALPHA */ code'
    [IO.File]::WriteAllText($Ctx.Js, $patched)
    [IO.File]::WriteAllText($Ctx.WebJs, 'web')
    [IO.File]::WriteAllText($Ctx.Css, 'body{} /* BETA */')
    Open-TextBatch @($Ctx.Js, $Ctx.WebJs, $Ctx.Css)
    $before = Get-InstalledGuards $Ctx $map
    Write-Text $Ctx.Css 'body{}'
    Check 'the installed guards are read from the held copy' (
        $before.Count -eq 2 -and (Get-InstalledGuards $Ctx $map).Count -eq 1)

    $problems = @(Save-UnlessRegressed $Ctx $map $before)
    Check 'a run that drops an installed patch writes nothing and names it' (
        $problems.Count -eq 1 -and $problems[0] -like '*beta*' -and
        (& $disk $Ctx.Css) -eq 'body{} /* BETA */' -and -not (Get-HeldKey $Ctx.Css))

    Open-TextBatch @($Ctx.Js, $Ctx.WebJs, $Ctx.Css)
    $before = Get-InstalledGuards $Ctx $map
    Write-Text $Ctx.WebJs 'web, newer'
    $problems = @(Save-UnlessRegressed $Ctx $map $before)
    Check 'a run that keeps every installed patch is written' (-not $problems.Count -and (& $disk $Ctx.WebJs) -eq 'web, newer')

    [IO.File]::WriteAllText($Ctx.Js, 'app code')
    [IO.File]::WriteAllText($Ctx.Css, 'body{}')
    Open-TextBatch @($Ctx.Js, $Ctx.WebJs, $Ctx.Css)
    $before = Get-InstalledGuards $Ctx $map
    Write-Text $Ctx.Js $patched
    $problems = @(Save-UnlessRegressed $Ctx $map $before)
    Check 'a fresh install takes a partial run' (-not $problems.Count -and (& $disk $Ctx.Js) -eq $patched)

    [IO.File]::WriteAllText($Ctx.Css, 'body{} /* BETA */')
    Open-TextBatch @($Ctx.Js, $Ctx.WebJs, $Ctx.Css)
    $before = Get-InstalledGuards $Ctx $alphaOnly
    Write-Text $Ctx.Css 'body{}'
    $problems = @(Save-UnlessRegressed $Ctx $alphaOnly $before)
    Check 'a patch left out of the run is not counted as lost' (-not $problems.Count -and (& $disk $Ctx.Css) -eq 'body{}')
}
finally {
    Close-TextBatch
    Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
}
if ($failed) { exit 1 }
