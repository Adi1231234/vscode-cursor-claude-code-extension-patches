# Shared UTF-8 (no BOM) file I/O. The minified bundles contain glyphs (queue
# arrows, etc.) that get mangled if written with the host's default code page,
# so every read/write goes through these helpers.

$script:Utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Read-Text {
    param([Parameter(Mandatory)][string]$Path)
    [System.IO.File]::ReadAllText($Path)
}

function Write-Text {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Text)
    [System.IO.File]::WriteAllText($Path, $Text, $script:Utf8NoBom)
}

function Add-Text {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Text)
    [System.IO.File]::AppendAllText($Path, $Text, $script:Utf8NoBom)
}
