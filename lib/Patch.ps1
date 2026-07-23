# Reusable patch operations shared by the patches/ folders. Keeping these here
# means each patch stays a few lines of intent, and the read/guard/inject/write
# boilerplate lives in exactly one place.

# Append a CSS resource to the webview stylesheet, once (guarded by a marker the
# resource itself contains).
function Add-StyleBlock {
    param($Ctx, [string]$CssPath, [string]$Guard, [string]$Label)
    $css = Read-Text $Ctx.Css
    if ($css.Contains($Guard)) { Write-Skip "$Label already present"; return }
    Add-Text $Ctx.Css ("`r`n`r`n" + (Read-Text $CssPath))
    Write-Ok "$Label appended"
}

# Inject a <script> into extension.js right after the </script> that follows the
# first of $Anchors found. Used for the chained webview scripts (input-rtl, queue).
function Add-ScriptAfterMarker {
    param($Ctx, [string]$Script, [string]$Guard, [string]$Label, [string[]]$Anchors)
    $js = Read-Text $Ctx.Js
    if ($js.Contains($Guard)) { Write-Skip "$Label already patched"; return }
    $at = -1
    foreach ($a in $Anchors) { $at = $js.IndexOf($a); if ($at -ge 0) { break } }
    if ($at -lt 0) { Write-Miss "$Label anchor not found ($($Anchors -join ' / '))"; return }
    $end = $js.IndexOf('</script>', $at) + '</script>'.Length
    Write-Text $Ctx.Js ($js.Substring(0, $end) + "`n        " + $Script + $js.Substring($end))
    Write-Ok "$Label injected"
}

# Inject a <script> after a regex-matched tag (pattern must capture the tag as $1).
# Used for zoom, which anchors on the webview's module <script> tag.
function Add-ScriptAfterRegex {
    param($Ctx, [string]$Script, [string]$Pattern, [string]$Guard, [string]$Label)
    $js = Read-Text $Ctx.Js
    if ($js.Contains($Guard)) { Write-Skip "$Label already patched"; return }
    if ($js -notmatch $Pattern) { Write-Miss "$Label anchor not found"; return }
    Write-Text $Ctx.Js ($js -replace $Pattern, "`$1`n        $Script")
    Write-Ok "$Label injected"
}

# The shared worktree-session resolver (used by worktree-title-dir + worktree-fork-diff).
function Get-CcWtResolveHelper { (Read-Text (Join-Path $PSScriptRoot 'js\ccWtResolve.js')).Trim() }

# Prepend the resolver to $Js once (no-op if already present); returns the new text.
function Add-CcWtResolveHelper {
    param([string]$Js)
    if ($Js -match '__ccWtResolve=async function') { return $Js }
    "/* CCWTRESOLVE */`n" + (Get-CcWtResolveHelper) + "`n" + $Js
}
