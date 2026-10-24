# The Start-menu / Desktop shortcut that launches the patched copy.
# Points straight at the patched claude.exe (our version.dll beside it does the
# fingerprint step); userData stays the shared %APPDATA%\Claude, so chats and
# login carry over from the Store build.

function New-PatchedShortcut([string]$exe, [string]$name) {
    $sm = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
    $lnk = Join-Path $sm "$name.lnk"
    $sh = New-Object -ComObject WScript.Shell
    $s = $sh.CreateShortcut($lnk)
    $s.TargetPath = $exe
    $s.WorkingDirectory = Split-Path $exe
    $s.IconLocation = "$exe,0"
    $s.Description = "Claude Desktop (patched)"
    $s.Save()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($sh) | Out-Null
    return $lnk
}
