# A run never leaves an install with fewer working patches than it found.
#
# Measured on 2026-10-09: an install carried every patch; install.ps1 was run
# from a master that had a bug in it, seven patches threw, and the run wrote the
# rest over the install anyway. The user's messages lost their RTL, and nothing
# on screen said why. A run that applies less than is already installed is a
# regression, not an update.
#
# So apply.ps1 reads which patch guards the install carries before the run, and
# writes the bundles only when every one of them is still there afterwards;
# otherwise it lets go of them, the install stays exactly as it was, and the run
# fails naming what it would have removed. Only the patches the run means to
# apply count: one left out with -Skip, or taken out of $order, is a choice. A
# new extension version is a fresh folder with nothing installed, so a partial
# run there still writes - some patches beat none.

# guard -> patch name, for the patches this run applies (the guards are read
# out of each patch.ps1 the way lib/Pristine.ps1 reads them). A guard belongs to
# the first patch in run order that names it: a later one names it only as the
# place to inject after (message-bidi names /* COPYMSG */ ... /* ZOOM */).
function Get-PatchGuardMap {
    param([Parameter(Mandatory)][string]$PatchesDir, [string[]]$Names = @())
    $map = @{}
    foreach ($n in $Names) {
        $f = Join-Path $PatchesDir "$n\patch.ps1"
        if (-not (Test-Path $f)) { continue }
        foreach ($g in @(Get-GuardsIn $f)) { if (-not $map.ContainsKey($g)) { $map[$g] = $n } }
    }
    $map
}

# Which of those guards the install carries, in any of its three bundles. On a
# held path Read-Text returns the held copy (lib/Io.ps1).
function Get-InstalledGuards {
    param([Parameter(Mandatory)]$Ctx, [Parameter(Mandatory)][hashtable]$GuardMap)
    $text = (@($Ctx.Js, $Ctx.WebJs, $Ctx.Css) | Where-Object { $_ -and (Test-Path $_) } |
        ForEach-Object { Read-Text $_ }) -join "`n"
    @($GuardMap.Keys | Where-Object { $text.Contains($_) })
}

# Writes the held bundles unless that would remove a patch installed before the
# run. Returns the problems for apply.ps1 to report; none means written.
function Save-UnlessRegressed {
    param([Parameter(Mandatory)]$Ctx, [Parameter(Mandatory)][hashtable]$GuardMap, [string[]]$Before = @())
    $after = @(Get-InstalledGuards $Ctx $GuardMap)
    # An empty list comes back from a function as $null; piped, that is one item.
    $lost = @(@($Before) | Where-Object { $_ -and $after -notcontains $_ } | ForEach-Object { $GuardMap[$_] } | Sort-Object -Unique)
    if ($lost) {
        Close-TextBatch
        return @("kept the install as it was - this run would have removed: $($lost -join ', ')")
    }
    @(Save-TextBatch | ForEach-Object { "could not write $_" })
}
