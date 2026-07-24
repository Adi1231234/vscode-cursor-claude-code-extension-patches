# Worktree sessions in history - the history-list handler hardcodes
# includeWorktrees:!1 (off). Flip it to !0 so /resume and the history panel list
# sessions from every worktree of the repo. Anchored on semantic (non-minified)
# keys, so it is stable across versions; fail-safe if absent. The replacement
# fragment lives in include-worktrees-on.js (no JS inline in this script).
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js -match 'dir:this\.cwd,includeWorktrees:!0') { Write-Skip 'already patched'; return }
    $anchor = 'dir:this.cwd,includeWorktrees:!1'
    if (-not $js.Contains($anchor)) { Write-Miss 'includeWorktrees anchor not found'; return }
    $new = Get-InjectedJs (Join-Path $PSScriptRoot 'include-worktrees-on.js')
    Write-Text $Ctx.Js $js.Replace($anchor, $new)
    Write-Ok 'includeWorktrees flipped on'
}
