# Worktree banner - shrinks the verbose banner to a compact "worktree: NAME".
function Invoke-Patch {
    param($Ctx)
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'worktree.css') '/* WORKTREE */' 'worktree banner CSS'
}
