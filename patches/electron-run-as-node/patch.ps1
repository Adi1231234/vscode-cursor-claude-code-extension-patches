# ELECTRON_RUN_AS_NODE leak fix. The extension host runs with
# ELECTRON_RUN_AS_NODE=1 (VS Code and Cursor alike - see README.md); the extension
# re-spreads process.env unfiltered into every env it builds for the child CLI,
# leaking the flag into every subprocess the CLI spawns.
# Strip it at each construction site. Each site is optional (some may not
# exist on a given version); the patch applies whatever it finds.
# The authored replacement JS lives in js/*.js - `Anchor`/`Rx` only *locate* existing
# bundle code (a search key, never authored runtime). 'Append' adds the fragment
# after the anchor; 'Replace' swaps the anchor for the (placeholder-filled) fragment.
# A site with `Rx` matches by regex and feeds its capture groups (`Captures`:
# placeholder -> group number) into the fragment, so minified names are never assumed.
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js -match '/\* ELECTRONFIX \*/') { Write-Skip 'already patched'; return }
    $dir = Join-Path $PSScriptRoot 'js'

    $sites = @(
        @{ Rx = 'function [\w$]+\([\w$]+\)\{let [\w$]+=[\w$]+\([\w$]+\("environmentVariables"\)\),([\w$]+)=\{\.\.\.process\.env\};'
           File = 'delete-flag.js'; Mode = 'Append'; Captures = [ordered]@{ '__ENV__' = 1 }
           Label = 'environmentVariables env builder' }
        @{ Anchor = 'env:c={...process.env}'
           File = 'env-object.js'; Mode = 'Replace'; Subs = @{}
           Label = 'SDK transport initialize() default env' }
        @{ Anchor = '{...process.env,...e.env}'
           File = 'spread-merge.js'; Mode = 'Replace'
           Subs = [ordered]@{ '__ERD__' = '__erdB'; '__REST__' = '__baseB'; '__EXTRA__' = 'e.env' }
           Label = 'auth spawn (...e.env)' }
        @{ Anchor = '{...process.env,...r.env}'
           File = 'spread-merge.js'; Mode = 'Replace'
           Subs = [ordered]@{ '__ERD__' = '__erdC'; '__REST__' = '__baseC'; '__EXTRA__' = 'r.env' }
           Label = 'runClaudeCommandRaw (...r.env)' }
    )

    $any = $false
    foreach ($s in $sites) {
        if ($s.Rx) {
            $m = [regex]::Match($js, $s.Rx)
            if (-not $m.Success) { Write-Miss ($s.Label + ' not found'); continue }
            $anchor = $m.Value
            $subs = [ordered]@{}
            foreach ($k in $s.Captures.Keys) { $subs[$k] = $m.Groups[$s.Captures[$k]].Value }
        } else {
            if (-not $js.Contains($s.Anchor)) { Write-Miss ($s.Label + ' not found'); continue }
            $anchor = $s.Anchor
            $subs = $s.Subs
        }
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
