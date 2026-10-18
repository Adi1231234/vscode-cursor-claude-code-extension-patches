# lib/CssModules.ps1: every CSS-module map in the bundle is read, whatever its
# keys look like. Run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File lib/tests/css-modules.test.ps1
# Exits 1 when a check failed.
#
#   1. a map with a quoted key (a class with a hyphen) is read whole
#   2. classes of that map resolve, alone and as {{root@...}}
#   3. a map of bare keys is read as before
#   4. an object whose values are not <key>_<hash> is not a module
#
# The fixtures are the shapes of 2.1.301's markdown module (KaTeX's classes
# quoted beside codeBlockWrapper) and of a plain one. A reader that took bare
# keys only dropped the first, and rtl and message-bidi wrote nothing.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\CssModules.ps1')

$failed = 0
function Check([string]$Name, [bool]$Ok) {
    if ($Ok) { Write-Host "PASS  $Name" } else { Write-Host "FAIL  $Name"; $script:failed++ }
}

$bundle = 'var PU={root:"root_-a7MRw","katex-display":"katex-display_-a7MRw",' +
          'codeBlockWrapper:"codeBlockWrapper_-a7MRw"};' +
          'var aJ1={root:"root_o3SSrg",toolSummary:"toolSummary_o3SSrg"};' +
          'var cfg={mode:"fast",level:"high"};'
$mods = Get-CssModules $bundle
$md = @($mods | Where-Object { $_.ContainsKey('codeBlockWrapper') })

Check 'a map with a quoted key is read whole' ($md.Count -eq 1 -and $md[0].Count -eq 3 -and
    $md[0]['katex-display'] -eq 'katex-display_-a7MRw')
$Ctx = @{ CssModules = $mods }
$r = Expand-CssClasses $Ctx '.{{codeBlockWrapper}} .{{root@codeBlockWrapper}} .{{root@toolSummary}}'
Check 'its classes resolve, alone and as root@' ($r.Missing.Count -eq 0 -and
    $r.Text -eq '.codeBlockWrapper_-a7MRw .root_-a7MRw .root_o3SSrg')
Check 'a map of bare keys is read as before' (@($mods | Where-Object { $_.ContainsKey('toolSummary') }).Count -eq 1)
Check 'an object that is not a module is left out' ($mods.Count -eq 2)

if ($failed) { exit 1 }
