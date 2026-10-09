# Keeping an unpatched copy, so a second run can install a newer version of a
# patch instead of skipping it.
#
# Every patch guards itself with a marker and skips when it is already there.
# That makes a run idempotent, which is what you want when nothing has changed -
# and it means an install patched last week never receives this week's version of
# the same patch. `apply.ps1` reports "[skip] ... already patched" on every line
# and exits 0, which reads exactly like success.
#
# Measured on this machine: a bundle patched at 20:00, eleven merges landed after
# it, apply.ps1 re-run - every line [skip], the extension byte-for-byte the same,
# and none of the eleven in it.
#
# So the file the patches are applied to is not the installed one but a copy of
# the original kept beside it. Every run restores that copy first and applies the
# whole set to it, which makes the result a function of the current patches alone
# rather than of the order they were ever installed in.

# The guards, read out of the patches themselves rather than listed here: a
# hand-kept list is a list that goes stale the first time someone adds a patch.
#
# They are passed positionally, not by name, so what identifies one is the
# convention every patch in this repo follows - a single-quoted block comment,
# '/* QUEUE */', '/* AUTOFOLLOWUP */'. Twenty-seven of them across the tree; a
# first version looked for -Guard and found none, which turned "this bundle is
# already patched" into "there is nothing to check against".
# Two spellings of the same marker: '/* NAME */' as written into the bundle, and
# '/\* NAME \*/' as the -match a patch checks it with (subagent-stream-flags,
# electron-run-as-node and reload-restore only ever spell it the second way).
function Get-GuardsIn([string]$PatchFile) {
    $text = Read-Text $PatchFile
    [regex]::Matches($text, "'(/\*[^']*?\*/[^']*?)'") | ForEach-Object { $_.Groups[1].Value }
    [regex]::Matches($text, "'/\\\* ([^'\\]+?) \\\*/'") | ForEach-Object { "/* $($_.Groups[1].Value) */" }
}

function Get-PatchGuards {
    param([Parameter(Mandatory)][string]$PatchesDir)
    $guards = @()
    foreach ($f in Get-ChildItem $PatchesDir -Recurse -Filter 'patch.ps1' -ErrorAction SilentlyContinue) {
        $guards += @(Get-GuardsIn $f.FullName)
    }
    $guards | Sort-Object -Unique
}

function Test-AlreadyPatched {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string[]]$Guards)
    if (-not (Test-Path $Path)) { return $false }
    $text = Read-Text $Path
    foreach ($g in $Guards) { if ($text.Contains($g)) { return $true } }
    return $false
}

# Returns $true when the install is ready to be patched from a known original,
# $false when it is not and the caller should stop.
function Restore-Pristine {
    param([Parameter(Mandatory)]$Ctx, [Parameter(Mandatory)][string]$PatchesDir)

    $guards = @(Get-PatchGuards -PatchesDir $PatchesDir)
    if (-not $guards) { Write-Miss "no patch guards found under $PatchesDir - not touching the bundle"; return $false }

    $ok = $true
    foreach ($key in @('Js', 'WebJs', 'Css')) {
        $file = $Ctx[$key]
        if (-not $file -or -not (Test-Path $file)) { continue }
        $pristine = "$file.pristine"

        # Into the held copy when apply.ps1 has the bundles open (lib/Io.ps1), so
        # the installed file is replaced only once the run is known to be no worse
        # than it (lib/Regression.ps1).
        if (Test-Path $pristine) {
            Write-Text $file (Read-Text $pristine)
            continue
        }

        # No original kept, and the file already carries a guard: this bundle was
        # patched by a patcher that did not keep one, and there is nothing here to
        # recover it from. Saying so is the whole point - the alternative is
        # snapshotting a patched file as the original and baking the old patches in
        # for ever.
        if (Test-AlreadyPatched -Path $file -Guards $guards) {
            Write-Fail "$([System.IO.Path]::GetFileName($file)) is already patched and no $([System.IO.Path]::GetFileName($pristine)) exists"
            Write-Miss "  nothing here can undo it. Reinstall the extension in $($Ctx.Editor) - or delete"
            Write-Miss "  $($Ctx.Dir) and let the editor download it again - then run this once more."
            $ok = $false
            continue
        }

        Copy-Item $file $pristine -Force
        Write-Info "kept the original as $([System.IO.Path]::GetFileName($pristine))"
    }
    return $ok
}
