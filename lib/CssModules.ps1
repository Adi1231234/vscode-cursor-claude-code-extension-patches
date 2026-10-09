# The app's own class names, exactly - for injected CSS and JS.
#
# Every class the webview draws comes from a CSS-module map in its bundle:
# {root:"root_ZUQaOA",toolSummary:"toolSummary_ZUQaOA",...} - each key plus one
# hash shared by the whole module, a new hash every release. Patches used to
# reach them by substring ([class*="toolSummary_"]), which Blink cannot file
# under any class: such a rule is tried on every element on every style pass,
# and every class change anywhere re-checks every element that has a class
# (tools/perf measured both). So a patch names the class, and this fills it in.
#
#   {{toolSummary}}             the one module that defines toolSummary
#   {{root@toolSummary}}        root, from the module that also defines
#                               toolSummary (five modules define a root)
#
# A key that no module defines, or that more than one does and nothing narrows
# it to one, is a miss: the caller writes nothing (fail-safe), never a guess.

$script:CssPlaceholder = '\{\{(?<key>[A-Za-z][A-Za-z0-9_]*)(?:@(?<within>[A-Za-z][A-Za-z0-9_]*))?\}\}'

# Every module map in the bundle, as hashtables of key -> class. Read once per
# install, in Find-ClaudeExtension.
function Get-CssModules {
    param([string]$WebJs)
    $mods = @()
    foreach ($m in [regex]::Matches($WebJs, '\{((?:[\w$]+:"[\w-]+",?)+)\}')) {
        $keys = @{}
        $hashes = @{}
        foreach ($p in [regex]::Matches($m.Groups[1].Value, '([\w$]+):"([\w-]+)"')) {
            $k = $p.Groups[1].Value; $v = $p.Groups[2].Value
            if (-not $v.StartsWith("$($k)_")) { $keys = $null; break }
            $keys[$k] = $v
            $hashes[$v.Substring($k.Length + 1)] = $true
        }
        if ($keys -and $keys.Count -gt 0 -and $hashes.Count -eq 1) { $mods += , $keys }
    }
    return , $mods
}

function Resolve-CssClass {
    param($Modules, [string]$Key, [string]$Within)
    $hits = @($Modules | Where-Object { $_.ContainsKey($Key) -and (-not $Within -or $_.ContainsKey($Within)) })
    if ($hits.Count -ne 1) { return $null }
    return $hits[0][$Key]
}

# Fill in every {{key}} / {{key@within}}. Returns the text and the placeholders
# that resolved to no class or to more than one. -Stylesheet leaves /* comments */
# alone: a comment that explains the syntax is not a class, and one naming an
# ambiguous key would otherwise refuse the whole block.
function Expand-CssClasses {
    param($Ctx, [string]$Text, [switch]$Stylesheet)
    $rx = if ($Stylesheet) { '/\*[\s\S]*?\*/|' + $script:CssPlaceholder } else { $script:CssPlaceholder }
    $modules = $Ctx.CssModules
    $missing = New-Object System.Collections.Generic.List[string]
    $out = [regex]::Replace($Text, $rx, {
        param($m)
        if (-not $m.Groups['key'].Success) { return $m.Value }   # a comment
        $c = Resolve-CssClass $modules $m.Groups['key'].Value $m.Groups['within'].Value
        if ($c) { return $c }
        $missing.Add($m.Value)
        $m.Value
    }.GetNewClosure())
    return @{ Text = $out; Missing = @($missing | Sort-Object -Unique) }
}
