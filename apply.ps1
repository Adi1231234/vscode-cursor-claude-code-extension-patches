# Claude Code (Cursor / VS Code) extension patcher - orchestrator.
#
# Discovers every install of the extension - Cursor, VS Code, Insiders, VSCodium
# (see lib/Editors.ps1) - and runs each patch in `patches/<name>/` against each.
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

# -ExtensionsDir patches one specific dir instead of auto-discovering (an editor
# started with a custom --extensions-dir).
param([string]$ExtensionsDir)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot

Get-ChildItem (Join-Path $here 'lib') -Filter *.ps1 | ForEach-Object { . $_.FullName }

$installs = if ($ExtensionsDir) { @(Find-ClaudeExtension -ExtensionsDir $ExtensionsDir) }
            else                { @(Find-ClaudeExtensions) }
if (-not $installs) { throw "Claude Code extension not found in any editor under $env:USERPROFILE (.cursor / .vscode / .vscode-insiders / .vscode-oss)" }

# Explicit run order (see note above about the webview-script chain).
$order = @(
    'rtl'
    'worktree-banner'
    'zoom'
    'input-rtl'
    'prompt-queue'
    'background-tasks'
    'subagent-stream-flags'
    'copy-message'
    'message-bidi'
    'bidi-mark-strip'
    'inline-code-copy'
    'bypass-permissions'
    'electron-run-as-node'
    'worktree-history'
    'worktree-title-dir'
    'worktree-fork-diff'
    'cwd-drive-case'
    'reload-restore'
    'remote-control-chip'
    'history-dialog-clip'
)

# The anchors track the current extension line. An install left far behind (easy to
# miss on a second editor) still patches whatever matches, but say so up front -
# a wall of [miss] otherwise reads like a broken patcher.
$minTested = [version]'2.1.220'

$script:failures = @()

foreach ($Ctx in $installs) {
    Write-Head "Patching $($Ctx.Editor): $($Ctx.Name)"
    Write-Info "nonce=$($Ctx.Nonce)  messageInput=$($Ctx.MessageInputClass)  preview=$($Ctx.PvHash)"
    if ($Ctx.Version -lt $minTested) {
        Write-Miss "extension $($Ctx.Version) is older than the anchored $minTested - expect [miss] lines; update it in $($Ctx.Editor) and re-run"
    }

    foreach ($name in $order) {
        $patchFile = Join-Path $here "patches\$name\patch.ps1"
        if (-not (Test-Path $patchFile)) { Write-Miss "patch '$name' not found"; continue }
        Write-Head $name
        # $ErrorActionPreference is Stop, so without this one patch throwing ends the
        # whole run and the patches after it are never attempted. That reads as "my
        # patch does nothing" rather than as a broken patch, and tools/lab would go on
        # to measure a half-patched bundle. Catch it, report it, carry on - and make
        # the run itself fail at the end so nothing downstream mistakes it for success.
        try {
            . $patchFile      # (re)defines Invoke-Patch for this folder
            Invoke-Patch $Ctx # $PSScriptRoot inside resolves to patches/<name>/
        } catch {
            $script:failures += "$name : $($_.Exception.Message)"
            Write-Fail "$name threw: $($_.Exception.Message)"
        }
    }
}

$editors = ($installs | ForEach-Object { $_.Editor }) -join ' / '
if ($script:failures) {
    Write-Host "`n$($script:failures.Count) patch(es) failed - this install is only partly patched:" -ForegroundColor Red
    foreach ($f in $script:failures) { Write-Host "  $f" -ForegroundColor Red }
    exit 1
}
Write-Host "`nDone ($editors). Reload the window: Ctrl+Shift+P -> Developer: Reload Window" -ForegroundColor Cyan
