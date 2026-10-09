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
# started with a custom --extensions-dir). -Skip leaves the named patches out of
# $order, for measuring what one patch costs (tools/perf: `--skip`).
param([string]$ExtensionsDir, [string[]]$Skip = @())

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
# `-File apply.ps1 -Skip a,b` arrives as one string; a list from PowerShell does not.
$Skip = @($Skip | ForEach-Object { $_ -split ',' } | Where-Object { $_ })

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
    'subagent-stream-flags'
    'copy-message'
    'message-bidi'
    'bidi-mark-strip'
    'inline-code-copy'
    'bypass-permissions'
    'electron-run-as-node'
    'worktree-history'
    'cwd-drive-case'
    'worktree-resume-origin'
    'worktree-gone-history'
    'reload-restore'
    'remote-control-pill-icon'
    'panel-settings'
    'footer-fit'
    'history-dialog-clip'
    'panel-restart-button'
    'auto-followup'
    'phone-queue'
    'input-usage'
    'message-time'
    'message-cards'
    'panel-background'
)

# The anchors track the current extension line. An install left far behind (easy to
# miss on a second editor) still patches whatever matches, but say so up front -
# a wall of [miss] otherwise reads like a broken patcher.
$minTested = [version]'2.1.220'

# One value per run, written into every injected script. It is what lets a
# panel say "the bundle on disk is newer than the code I am running" instead of
# leaving someone to reload and wonder - see patches/auto-followup/host/stamp.js.
$stampSha = ""
try { $stampSha = (& git -C $here rev-parse --short HEAD 2>$null) } catch {}
$script:CcStamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mmZ") +
                  $(if ($stampSha) { " " + $stampSha.Trim() } else { "" })
Write-Info "build stamp: $script:CcStamp"

$script:failures = @()
# Patches whose anchor did not match. Collected so the run ends by naming them:
# see the comment in lib/Ui.ps1 for what a miss that scrolled past cost once.
$script:missed = @()
$guardMap = Get-PatchGuardMap (Join-Path $here 'patches') @($order | Where-Object { $Skip -notcontains $_ })

foreach ($Ctx in $installs) {
    Write-Head "Patching $($Ctx.Editor): $($Ctx.Name)"
    Write-Info "nonce=$($Ctx.Nonce)  messageInput=$($Ctx.MessageInputClass)  preview=$($Ctx.PvHash)"
    if ($Ctx.Version -lt $minTested) {
        Write-Miss "extension $($Ctx.Version) is older than the anchored $minTested - expect [miss] lines; update it in $($Ctx.Editor) and re-run"
    }

    # The bundles are held in memory from here and written once, at the end, only
    # if no patch installed now is lost (lib/Io.ps1, lib/Regression.ps1).
    Open-TextBatch @($Ctx.Js, $Ctx.WebJs, $Ctx.Css)
    $installed = Get-InstalledGuards $Ctx $guardMap

    # Restore the original before applying anything. Without this every patch
    # sees its own guard from the last run and skips, so an install patched
    # yesterday never gets today version of a patch - and the run says [skip] on
    # every line and exits 0, which reads exactly like success. See lib/Pristine.ps1.
    if (-not (Restore-Pristine -Ctx $Ctx -PatchesDir (Join-Path $here "patches"))) {
        Close-TextBatch
        $script:failures += "$($Ctx.Editor) : no unpatched copy of the bundle to apply to"
        continue
    }
    foreach ($name in $order) {
        if ($Skip -contains $name) { Write-Skip "$name left out (-Skip)"; continue }
        $patchFile = Join-Path $here "patches\$name\patch.ps1"
        if (-not (Test-Path $patchFile)) { Write-Miss "patch '$name' not found"; continue }
        Write-Head $name
        # $ErrorActionPreference is Stop, so without this one patch throwing ends the
        # whole run and the patches after it are never attempted. That reads as "my
        # patch does nothing" rather than as a broken patch, and tools/lab would go on
        # to measure a half-patched bundle. Catch it, report it, carry on - and make
        # the run itself fail at the end so nothing downstream mistakes it for success.
        $missesBefore = Get-MissCount
        try {
            . $patchFile      # (re)defines Invoke-Patch for this folder
            Invoke-Patch $Ctx # $PSScriptRoot inside resolves to patches/<name>/
        } catch {
            # The editor is part of the entry: discovery patches every install it
            # finds, so the same patch name can fail on one and be fine on another.
            $script:failures += "$($Ctx.Editor) / $name : $($_.Exception.Message)"
            Write-Fail "$name threw: $($_.Exception.Message)"
        }
        if ((Get-MissCount) -gt $missesBefore) { $script:missed += "$($Ctx.Editor) / $name" }
    }
    foreach ($f in Save-UnlessRegressed $Ctx $guardMap $installed) {
        $script:failures += "$($Ctx.Editor) : $f"
        Write-Fail $f
    }
}

$editors = ($installs | ForEach-Object { $_.Editor }) -join ' / '
if ($script:missed) {
    Write-Host "`n$($script:missed.Count) patch(es) reported [miss] - they are NOT in the bundle:" -ForegroundColor DarkYellow
    foreach ($m in $script:missed) { Write-Host "  $m" -ForegroundColor DarkYellow }
    Write-Host "  An anchor that stopped matching in a new release looks exactly like this." -ForegroundColor DarkYellow
}
if ($script:failures) {
    Write-Host "`n$($script:failures.Count) patch(es) failed - the install below is only partly patched:" -ForegroundColor Red
    foreach ($f in $script:failures) { Write-Host "  $f" -ForegroundColor Red }
    exit 1
}
Write-Host "`nDone ($editors). Reload the window: Ctrl+Shift+P -> Developer: Reload Window" -ForegroundColor Cyan
# Said, not left over: under `& apply.ps1` a caller reads $LASTEXITCODE, which
# otherwise still holds the stamp's `git rev-parse` (non-zero outside a checkout).
exit 0
