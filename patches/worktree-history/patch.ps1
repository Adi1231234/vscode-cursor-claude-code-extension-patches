# Worktree sessions in history - the history-list handler hardcodes
# includeWorktrees:!1 (off). Flip it to !0 so /resume and the history panel list
# sessions from every worktree of the repo. Anchored on semantic (non-minified)
# keys, so it is stable across versions; fail-safe if absent.
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js -match 'dir:this\.cwd,includeWorktrees:!0') { Write-Skip 'already patched'; return }
    if ($js.Contains('dir:this.cwd,includeWorktrees:!1')) {
        $js = $js.Replace('dir:this.cwd,includeWorktrees:!1', 'dir:this.cwd,includeWorktrees:!0')
        Write-Text $Ctx.Js $js
        Write-Ok 'includeWorktrees flipped on'
    } else {
        Write-Miss 'includeWorktrees anchor not found'
    }
}
