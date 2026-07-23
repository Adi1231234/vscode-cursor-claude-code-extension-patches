# One-line bootstrap. Downloads this repo to a temp folder, runs apply.ps1, cleans up.
#
#   irm https://raw.githubusercontent.com/Adi1231234/vscode-cursor-claude-code-extension-patches/master/install.ps1 | iex
#
# apply.ps1 needs the whole repo (lib/ + patches/<name>/), so we fetch the branch
# zip rather than a single file. Safe to re-run: every patch is idempotent.
$ErrorActionPreference = 'Stop'
$repo   = 'Adi1231234/vscode-cursor-claude-code-extension-patches'
$branch = 'master'

# TLS 1.2 for stock Windows PowerShell 5.1; process-scope bypass so the downloaded
# .ps1 files can run regardless of the machine's default execution policy.
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
try { Set-ExecutionPolicy Bypass -Scope Process -Force } catch {}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("ccp-" + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $tmp | Out-Null
try {
    $zip = Join-Path $tmp 'repo.zip'
    Write-Host "Downloading Claude Code patches ($repo@$branch)..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri "https://github.com/$repo/archive/refs/heads/$branch.zip" -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $tmp -Force

    $root = Get-ChildItem $tmp -Directory | Select-Object -First 1   # zip has one top-level folder
    $apply = Join-Path $root.FullName 'apply.ps1'
    if (-not (Test-Path $apply)) { throw "apply.ps1 not found in the downloaded repo" }
    & $apply
} finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
