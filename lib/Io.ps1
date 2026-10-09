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

function Read-Text {
    param([Parameter(Mandatory)][string]$Path)
    Invoke-FileIo { [System.IO.File]::ReadAllText($Path) }
}

function Write-Text {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Text)
    Invoke-FileIo { [System.IO.File]::WriteAllText($Path, $Text, $script:Utf8NoBom) }
}

function Add-Text {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Text)
    Invoke-FileIo { [System.IO.File]::AppendAllText($Path, $Text, $script:Utf8NoBom) }
}
