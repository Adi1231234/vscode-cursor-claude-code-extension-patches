# Finding an anchor that opens with an identifier, fast.
#
# The anchors capture minified names as ([\w$]+) (CLAUDE.md), and a pattern
# that opens with one has no literal for the regex engine to jump to: it is
# tried at every position of a 5 MB bundle. Measured on 2.1.294: 1.2 s a pass
# for the webview message-listener anchor, which Add-WebviewMessageHook ran
# twice for each of four patches - 19 of apply.ps1's 31 s.
#
# So the literal that follows the identifier is found first, with an ordinal
# search, and the pattern is run only where the identifier before each one
# starts (\G - at that position, nowhere else). Same matches as a full regex
# pass, left to right and never overlapping.

function Test-IdentifierChar([char]$c) { [char]::IsLetterOrDigit($c) -or $c -eq '_' -or $c -eq '$' }

# The same for a pattern whose distinctive literal sits further in: it is run
# only in a window around each occurrence of the literal, from an identifier
# boundary at most $Before characters ahead of it to $After past it. The
# caller's contract: every match contains the literal and starts within
# $Before of it. Matches come back left to right, never overlapping.
function Find-NearLiteral {
    param([string]$Text, [string]$Literal, [string]$Pattern, [int]$Before = 200, [int]$After = 2000)
    $re = [regex]::new($Pattern)
    $found = New-Object System.Collections.Generic.List[System.Text.RegularExpressions.Match]
    $next = 0
    $i = $Text.IndexOf($Literal, [StringComparison]::Ordinal)
    while ($i -ge 0) {
        $s = [Math]::Max([Math]::Max(0, $i - $Before), $next)
        while ($s -gt $next -and $s -gt 0 -and (Test-IdentifierChar $Text[$s - 1])) { $s-- }
        $len = [Math]::Min($Text.Length, $i + $Literal.Length + $After) - $s
        for ($m = $re.Match($Text, $s, $len); $m.Success; $m = $m.NextMatch()) {
            if ($m.Index -lt $next) { continue }
            $found.Add($m)
            $next = $m.Index + [Math]::Max($m.Length, 1)
        }
        $i = $Text.IndexOf($Literal, $i + $Literal.Length, [StringComparison]::Ordinal)
    }
    return , $found
}

function Find-IdentifierAnchored {
    param([string]$Text, [string]$Literal, [string]$Pattern)
    $re = [regex]::new('\G(?:' + $Pattern + ')')
    $found = New-Object System.Collections.Generic.List[System.Text.RegularExpressions.Match]
    $after = 0
    $i = $Text.IndexOf($Literal, [StringComparison]::Ordinal)
    while ($i -ge 0) {
        $s = $i
        while ($s -gt 0 -and (Test-IdentifierChar $Text[$s - 1])) { $s-- }
        if ($s -ge $after) {
            $m = $re.Match($Text, $s)
            if ($m.Success) { $found.Add($m); $after = $m.Index + $m.Length }
        }
        $i = $Text.IndexOf($Literal, $i + $Literal.Length, [StringComparison]::Ordinal)
    }
    return , $found
}
