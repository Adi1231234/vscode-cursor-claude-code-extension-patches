# Fetch the latest Claude Desktop release and extract its Electron app folder.
# The release .msix is a plain ZIP; the Electron app lives under its "app/".

function Get-LatestMsix {
    # -> @{ Version = "3.6556.2"; Url = "https://downloads.claude.ai/.../Claude-<hash>.msix" }
    $api = "https://api.anthropic.com/api/desktop/win32/x64/msix/latest"
    $r = Invoke-RestMethod $api -TimeoutSec 30
    if (-not $r.version -or -not $r.url) { throw "update endpoint gave no version/url" }
    return @{ Version = [string]$r.version; Url = [string]$r.url }
}

# Download the .msix and extract only its app/ subtree into $destApp (which is
# emptied first). Returns the number of files written.
function Save-MsixApp([string]$url, [string]$destApp) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("ccd-msix-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force $tmp | Out-Null
    $zip = Join-Path $tmp "pkg.zip"
    try {
        Write-Host "  downloading $url"
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile($url, $zip)

        if (Test-Path $destApp) { Remove-Item -Recurse -Force $destApp }
        New-Item -ItemType Directory -Force $destApp | Out-Null

        $archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
        $n = 0
        try {
            foreach ($e in $archive.Entries) {
                $name = $e.FullName
                if ($name -notlike "app/*") { continue }
                $rel = $name.Substring(4)                 # drop "app/"
                if ($rel -eq "" -or $rel.EndsWith("/")) { continue }
                $out = Join-Path $destApp ($rel -replace "/", "\")
                New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
                [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, $out, $true)
                $n++
            }
        } finally { $archive.Dispose() }
        if ($n -eq 0) { throw "no app/ entries in the package - layout changed" }
        return $n
    } finally {
        Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    }
}
