# Worktree banner - shrinks the verbose worktree banner to a small "worktree: NAME".
function Invoke-Patch {
    param($Ctx)
    $css = Read-Text $Ctx.Css
    if ($css -match '/\* WORKTREE \*/') { Write-Skip 'worktree CSS already present'; return }
    Add-Text $Ctx.Css ("`r`n`r`n" + (Read-Text (Join-Path $PSScriptRoot 'worktree.css')))
    Write-Ok 'worktree banner CSS appended'
}
