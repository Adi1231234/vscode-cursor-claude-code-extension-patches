# Phantom worktree-title cleanup (data fix, complements worktree-title-dir).
# The title-dir patch stops NEW phantoms being created; this removes the ones
# already on disk so they stop shadowing real transcripts. A file is only deleted
# when it is metadata-only (no messages) AND another project dir holds a real,
# larger transcript for the SAME session id. Anything without a content twin is
# left untouched. Safe + idempotent. Runs cleanup.js via node (dry-run, then apply).
function Invoke-Patch {
    param($Ctx)
    $cleanup = Join-Path $PSScriptRoot 'cleanup.js'
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Miss 'node not available; skipping cleanup'; return }
    Write-Info 'scanning for shadowing phantom title files...'
    & node $cleanup            # dry-run
    if ($LASTEXITCODE -eq 0) {
        & node $cleanup --apply
        Write-Ok 'phantom cleanup done'
    } else {
        Write-Miss 'cleanup scan failed'
    }
}
