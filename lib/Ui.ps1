# Tiny console-output helpers so every patch reports in a consistent style.

function Write-Head { param([string]$Message) Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Message) Write-Host "    [ok]   $Message" -ForegroundColor Green }
function Write-Skip { param([string]$Message) Write-Host "    [skip] $Message" -ForegroundColor Yellow }
function Write-Miss { param([string]$Message) Write-Host "    [miss] $Message" -ForegroundColor DarkYellow }
function Write-Info { param([string]$Message) Write-Host "    $Message" -ForegroundColor Gray }
