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
    # The bundle has to BE a <script> element. A patch that concatenates
    # something ahead of the fragment which opens the tag drops that text
    # outside it, and the browser renders the source on the page for the user to
    # read - which is how a shared lib file, prepended instead of inserted after
    # the opening fragment, ended up printed across a live panel.
    if (-not $Script.TrimStart().StartsWith('<script')) {
        Write-Miss "$Label does not open with <script> - something is concatenated before the fragment that opens it, and it would render as page text"
        return
    }
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

# Every chat surface in extension.js (editor tab / sidebar / session list)
# installs the same webview message listener: log the message, hand it to the
# comms object. A patch that answers messages of its own drops a returning guard
# at the very top of each of them, ahead of the app's protocol switch - which
# would otherwise log ours as unknown.
#
# The guard is inserted right after the arrow's `{`, and everything already
# there is carried through untouched, so several patches can hook the same
# listener and neither the order they run in nor the ones already installed
# matter. $HookPath is a .js resource with three placeholders: __WV__ (the
# view), __MSG__ (the message) and __COMMS__ (the comms object).
#
# Returns the new text, or $null when the listener shape is not found - callers
# are expected to Write-Miss and leave the bundle alone.
function Add-WebviewMessageHook {
    param([string]$Js, [string]$HookPath)
    # Two things about the gap between the listener's '{' and the ?.fromClient that
    # identifies it as a chat surface, and both only bite once hooks are installed:
    #
    #   [\s\S] and not '.', because an installed hook carries its own multi-line
    #   comment and '.' does not cross a newline in .NET. With three hooks in, the
    #   dot form matched zero of the three chat surfaces and this one matches all
    #   three - and the failure reads as version drift rather than as a regex that
    #   cannot see past its own predecessors.
    #
    #   2000 and not 400, because each patch inserts at the top and pushes
    #   fromClient further away; it was measured at +446 with three installed.
    #
    # The match stays lazy, so it still binds to the *nearest* fromClient and cannot
    # reach into a neighbouring listener. The doc-preview surface has none within
    # 20k and is still correctly excluded.
    $rx = '(([\w$]+)\.webview\.onDidReceiveMessage\(\(([\w$]+)\)=>\{)([\s\S]{0,2000}?([\w$]+)\?\.fromClient\(\3\))'
    if ($Js -notmatch $rx) { return $null }
    $hook = (Get-InjectedJs $HookPath ([ordered]@{
                '__WV__' = '${2}'; '__MSG__' = '${3}'; '__COMMS__' = '${5}'
            })).Trim()
    [regex]::Replace($Js, $rx, ('${1}' + $hook + '${4}'))
}

# Substitute __TOKEN__ placeholders in an injected-JS string. Literal .Replace
# (not -replace) so substitution values are never treated as regex. Keeps every
# injected script as real, formatted JS in its own .js file - never a PS string.
function Expand-JsTokens {
    param([string]$Js, $Subs)
    foreach ($k in $Subs.Keys) { $Js = $Js.Replace($k, [string]$Subs[$k]) }
    $Js
}

# Read a .js resource and expand its __TOKEN__ placeholders. The one way patches
# pull in JS: no JS ever lives inside a PowerShell string literal.
function Get-InjectedJs {
    param([string]$Path, $Subs = @{})
    Expand-JsTokens (Read-Text $Path) $Subs
}

# Path to a shared runtime JS resource in lib/js (e.g. 'ccCopyText.js'). For the
# patches that build their injected <script> from an ordered fragment list: drop
# this in at the right position instead of copying the runtime into the patch.
function Get-LibJsPath { param([string]$Name) Join-Path $PSScriptRoot "js/$Name" }
# The shared stylesheets, appended by whichever patch runs first - the guard in
# the file makes the second and third call a no-op.
function Get-LibCssPath { param([string]$Name) Join-Path $PSScriptRoot "css/$Name" }

# The shared worktree-session resolver (used by worktree-title-dir + worktree-fork-diff).
function Get-CcWtResolveHelper { (Read-Text (Join-Path $PSScriptRoot 'js\ccWtResolve.js')).Trim() }

# Prepend the resolver to $Js once (no-op if already present); returns the new text.
function Add-CcWtResolveHelper {
    param([string]$Js)
    if ($Js -match '__ccWtResolve=async function') { return $Js }
    "/* CCWTRESOLVE */`n" + (Get-CcWtResolveHelper) + "`n" + $Js
}
