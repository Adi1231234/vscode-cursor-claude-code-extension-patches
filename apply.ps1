# Claude Code (Cursor / VS Code) extension patcher - orchestrator.
#
# Discovers the installed extension, then runs each patch in `patches/<name>/`.
# Every patch is a self-contained folder that defines a single `Invoke-Patch`
# function taking the shared $Ctx (see lib/Extension.ps1). Patches are dot-sourced
# and invoked one at a time, so each is independent, reusable, and testable.
#
# Order matters only where a patch anchors on another's output: the webview script
# injections (zoom -> input-rtl -> prompt-queue) chain, so they run in that order.
# Everything else is independent.
#
# Re-run after each extension update. Every patch is idempotent and fail-safe:
# already-applied patches skip; a missing anchor skips instead of corrupting.

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot

Get-ChildItem (Join-Path $here 'lib') -Filter *.ps1 | ForEach-Object { . $_.FullName }

$Ctx = Find-ClaudeExtension
Write-Head "Patching $($Ctx.Name)"
Write-Info "nonce=$($Ctx.Nonce)  messageInput=$($Ctx.MessageInputClass)  preview=$($Ctx.PvHash)"

# Explicit run order (see note above about the webview-script chain).
$order = @(
    'rtl'
    'worktree-banner'
    'zoom'
    'input-rtl'
    'prompt-queue'
    'bypass-permissions'
    'electron-run-as-node'
    'worktree-history'
    'worktree-title-dir'
    'worktree-fork-diff'
    'reload-restore'
    'phantom-cleanup'
)

foreach ($name in $order) {
    $patchFile = Join-Path $here "patches\$name\patch.ps1"
    if (-not (Test-Path $patchFile)) { Write-Miss "patch '$name' not found"; continue }
    Write-Head $name
    . $patchFile          # (re)defines Invoke-Patch for this folder
    Invoke-Patch $Ctx     # $PSScriptRoot inside resolves to patches/<name>/
}

Write-Host "`nDone. Reload Cursor: Ctrl+Shift+P -> Developer: Reload Window" -ForegroundColor Cyan
