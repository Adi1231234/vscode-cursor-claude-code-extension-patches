# One-line bootstrap. Downloads this repo to a temp folder, runs the patch, cleans up.
#
#   # both (VS Code extension + desktop app) - the default, same as always:
#   irm https://raw.githubusercontent.com/Adi1231234/vscode-cursor-claude-code-extension-patches/master/install.ps1 | iex
#
#   # just one of them - pass -Scope as a flag (vscode / desktop / all):
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/Adi1231234/vscode-cursor-claude-code-extension-patches/master/install.ps1))) -Scope desktop
#
# The plain pipe form keeps today's behaviour (Scope defaults to 'all'); the
# scriptblock form is how PowerShell passes a flag to a downloaded script.
# apply.ps1 needs the whole repo (lib/ + patches/<name>/), so we fetch the branch
# zip rather than a single file. Safe to re-run: every patch is idempotent.
param(
    [ValidateSet('all', 'vscode', 'desktop')]
    [string]$Scope = 'all'
)
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
    Write-Host "Downloading Claude Code patches ($repo@$branch, scope=$Scope)..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri "https://github.com/$repo/archive/refs/heads/$branch.zip" -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $tmp -Force

    $root = Get-ChildItem $tmp -Directory | Select-Object -First 1   # zip has one top-level folder

    if ($Scope -ne 'desktop') {
        $apply = Join-Path $root.FullName 'apply.ps1'
        if (-not (Test-Path $apply)) { throw "apply.ps1 not found in the downloaded repo" }
        & $apply
    }
    if ($Scope -ne 'vscode') {
        $deskInstall = Join-Path $root.FullName 'desktop\install-desktop.ps1'
        if (Test-Path $deskInstall) {
            Write-Host "Installing/updating the patched desktop app..." -ForegroundColor Cyan
            & $deskInstall
        }
    }
} finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
