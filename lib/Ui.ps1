# Tiny console-output helpers so every patch reports in a consistent style.

# A run prints sixty lines, and one "[miss] anchor not found" in the middle of
# them scrolls past unread while the script still exits 0 - which is how
# bidi-mark-strip stopped landing in 2.1.269 and nobody noticed for eleven
# releases, with the panel printing ‎ again the whole time. So every miss
# is counted here, and apply.ps1 names the patches that reported one in a
# summary at the end. Not an exit code: a miss is legitimate on an older
# extension, so it is a thing to read, not a thing to fail on.
$script:MissCount = 0
function Get-MissCount { $script:MissCount }

function Write-Head { param([string]$Message) Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Message) Write-Host "    [ok]   $Message" -ForegroundColor Green }
function Write-Skip { param([string]$Message) Write-Host "    [skip] $Message" -ForegroundColor Yellow }
function Write-Miss {
    param([string]$Message)
    $script:MissCount++
    Write-Host "    [miss] $Message" -ForegroundColor DarkYellow
}
function Write-Fail { param([string]$Message) Write-Host "    [fail] $Message" -ForegroundColor Red }
function Write-Info { param([string]$Message) Write-Host "    $Message" -ForegroundColor Gray }
