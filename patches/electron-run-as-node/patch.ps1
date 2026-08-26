# ELECTRON_RUN_AS_NODE leak fix. The extension host runs with
# ELECTRON_RUN_AS_NODE=1 (VS Code and Cursor alike - see README.md); the extension
# re-spreads process.env unfiltered into every env it builds for the child CLI,
# leaking the flag into every subprocess the CLI spawns.
# Strip it at each construction site. Each site is optional (some may not
# exist on a given version); the patch applies whatever it finds.
# The authored replacement JS lives in js/*.js - `Rx`/`RxAll` only *locate* existing
# bundle code (a search key, never authored runtime). 'Append' adds the fragment
# after the match; 'Replace' swaps the match for the (placeholder-filled) fragment.
# Every site matches by regex and feeds its capture groups (`Captures`: placeholder
# -> group number) into the fragment, so a minified name is never written down: they
# are reassigned on every release, and were `c`/`e`/`r` when this was authored.
# `RxAll` is for an expression that occurs more than once under different names -
# each distinct occurrence is rewritten with its own `Unique` helper names, so two
# rewrites can never collide.
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js -match '/\* ELECTRONFIX \*/') { Write-Skip 'already patched'; return }
    $dir = Join-Path $PSScriptRoot 'js'

    $sites = @(
        @{ Rx = 'function [\w$]+\([\w$]+\)\{let [\w$]+=[\w$]+\([\w$]+\("environmentVariables"\)\),([\w$]+)=\{\.\.\.process\.env\};'
           File = 'delete-flag.js'; Mode = 'Append'; Captures = [ordered]@{ '__ENV__' = 1 }
           Label = 'environmentVariables env builder' }
        @{ Rx = 'env:([\w$]+)=\{\.\.\.process\.env\}'
           File = 'env-object.js'; Mode = 'Replace'; Captures = [ordered]@{ '__VAR__' = 1 }
           Label = 'SDK transport initialize() default env' }
        @{ RxAll = '\{\.\.\.process\.env,\.\.\.([\w$]+\.env)\}'
           File = 'spread-merge.js'; Captures = [ordered]@{ '__EXTRA__' = 1 }
           Unique = [ordered]@{ '__ERD__' = '__ccErd'; '__REST__' = '__ccBase' }
           Label = 'process.env spreads (auth spawn, runClaudeCommandRaw)' }
    )

    $any = $false
    foreach ($s in $sites) {
        if ($s.RxAll) {
            $ms = [regex]::Matches($js, $s.RxAll)
            if ($ms.Count -eq 0) { Write-Miss ($s.Label + ' not found'); continue }
            $seen = @{}
            $i = 0
            foreach ($m in $ms) {
                if ($seen.ContainsKey($m.Value)) { continue }   # .Replace already did every copy
                $seen[$m.Value] = $true
                $i++
                $subs = [ordered]@{}
                foreach ($k in $s.Captures.Keys) { $subs[$k] = $m.Groups[$s.Captures[$k]].Value }
                foreach ($k in $s.Unique.Keys) { $subs[$k] = [string]$s.Unique[$k] + $i }
                $js = $js.Replace($m.Value, (Get-InjectedJs (Join-Path $dir $s.File) $subs))
            }
            $any = $true; Write-Ok ($s.Label + " ($($ms.Count) occurrences, $i distinct)")
            continue
        }
        $m = [regex]::Match($js, $s.Rx)
        if (-not $m.Success) { Write-Miss ($s.Label + ' not found'); continue }
        $anchor = $m.Value
        $subs = [ordered]@{}
        foreach ($k in $s.Captures.Keys) { $subs[$k] = $m.Groups[$s.Captures[$k]].Value }
        $frag = Get-InjectedJs (Join-Path $dir $s.File) $subs
        $new = if ($s.Mode -eq 'Append') { $anchor + $frag } else { $frag }
        $js = $js.Replace($anchor, $new); $any = $true; Write-Ok $s.Label
    }

    if ($any) {
        Write-Text $Ctx.Js ("/* ELECTRONFIX */`n" + $js)
        Write-Ok 'ELECTRON_RUN_AS_NODE fix applied'
    } else {
        Write-Miss 'no ELECTRON_RUN_AS_NODE sites matched'
    }
}
