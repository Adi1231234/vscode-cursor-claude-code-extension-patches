# Shared UTF-8 (no BOM) file I/O. The minified bundles contain glyphs (queue
# arrows, etc.) that get mangled if written with the host's default code page,
# so every read/write goes through these helpers.

$script:Utf8NoBom = New-Object System.Text.UTF8Encoding $false

# A file just written can be held for a moment by another process. Measured on
# 2026-10-09: an apply.ps1 run lost its last write to extension.js to "being
# used by another process" - most likely an anti-virus scan of the write just
# before it - and left the install half-patched; the same run a minute later
# was clean. Windows raises no event when the file is free again, so a sharing
# or lock violation is retried, briefly (about 3 s in all), and anything else,
# or a lock that outlasts the retries, still fails the way it always did.
$script:FileBusy = @(0x80070020, 0x80070021)   # ERROR_SHARING_VIOLATION, ERROR_LOCK_VIOLATION

function Invoke-FileIo {
    param([Parameter(Mandatory)][scriptblock]$Do)
    $wait = 50
    for ($try = 1; ; $try++) {
        try { return & $Do }
        catch {
            # A .NET call's exception arrives wrapped (MethodInvocationException).
            $e = $_.Exception
            while ($e -and -not ($e -is [System.IO.IOException])) { $e = $e.InnerException }
            if (-not $e -or $try -ge 8 -or $script:FileBusy -notcontains $e.HResult) { throw }
            Start-Sleep -Milliseconds $wait
            $wait = [Math]::Min($wait * 2, 800)
        }
    }
}

# An install's three bundles are 4-5 MB each, and nearly every patch reads one
# and writes it back: about 50 reads and 30 writes per install. Each write is
# scanned by the anti-virus, and the next open of that file waits for the scan -
# measured on 2.1.294, 100-560 ms a time, 3.6 of apply.ps1's 6 s. So apply.ps1
# holds an install's bundles in memory while its patches run (Open-TextBatch)
# and writes each one once, at the end (Save-TextBatch). On a held path the
# three helpers below work on that copy; on any other they go to disk. A run
# that stops half way leaves the bundles as they were, not half-patched.
$script:Held = @{}

function Get-HeldKey([string]$Path) {
    $key = [System.IO.Path]::GetFullPath($Path)
    if ($script:Held.ContainsKey($key)) { $key }
}

function Open-TextBatch {
    param([string[]]$Paths)
    foreach ($p in $Paths) {
        if (-not $p -or -not (Test-Path $p)) { continue }
        $key = [System.IO.Path]::GetFullPath($p)
        $script:Held[$key] = @{ Text = (Invoke-FileIo { [System.IO.File]::ReadAllText($key) }); Changed = $false }
    }
}

# Writes every held file a patch changed and lets go of them all. Returns what
# could not be written; one failure does not keep the others from being tried.
function Save-TextBatch {
    $failed = @()
    foreach ($key in @($script:Held.Keys)) {
        $h = $script:Held[$key]
        $script:Held.Remove($key)
        if (-not $h.Changed) { continue }
        try { Write-Text $key $h.Text } catch { $failed += "$key : $($_.Exception.Message)" }
    }
    $failed
}

function Read-Text {
    param([Parameter(Mandatory)][string]$Path)
    $held = Get-HeldKey $Path
    if ($held) { return $script:Held[$held].Text }
    Invoke-FileIo { [System.IO.File]::ReadAllText($Path) }
}

function Write-Text {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Text)
    $held = Get-HeldKey $Path
    if ($held) { $script:Held[$held] = @{ Text = $Text; Changed = $true }; return }
    Invoke-FileIo { [System.IO.File]::WriteAllText($Path, $Text, $script:Utf8NoBom) }
}

function Add-Text {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Text)
    $held = Get-HeldKey $Path
    if ($held) { $script:Held[$held] = @{ Text = $script:Held[$held].Text + $Text; Changed = $true }; return }
    Invoke-FileIo { [System.IO.File]::AppendAllText($Path, $Text, $script:Utf8NoBom) }
}
