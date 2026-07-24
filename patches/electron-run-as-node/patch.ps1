# ELECTRON_RUN_AS_NODE leak fix. Cursor sets ELECTRON_RUN_AS_NODE=1 on its
# extension host; the extension re-spreads process.env unfiltered into every env
# it builds for the child CLI, leaking the flag into every subprocess the CLI
# spawns. Strip it at each construction site. Each site is optional (some may not
# exist on a given version); the patch applies whatever it finds.
# The authored replacement JS lives in js/*.js - `Anchor` only *locates* existing
# bundle code (a search key, never authored runtime). 'Append' adds the fragment
# after the anchor; 'Replace' swaps the anchor for the (placeholder-filled) fragment.
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js -match '/\* ELECTRONFIX \*/') { Write-Skip 'already patched'; return }
    $dir = Join-Path $PSScriptRoot 'js'

    $sites = @(
        @{ Anchor = 'function Id(e){let t=lfe(Tn("environmentVariables")),r={...process.env};'
           File = 'delete-flag.js'; Mode = 'Append'; Subs = @{}
           Label = 'Id() env builder' }
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
        if (-not $js.Contains($s.Anchor)) { Write-Miss ($s.Label + ' not found'); continue }
        $frag = Get-InjectedJs (Join-Path $dir $s.File) $s.Subs
        $new = if ($s.Mode -eq 'Append') { $s.Anchor + $frag } else { $frag }
        $js = $js.Replace($s.Anchor, $new); $any = $true; Write-Ok $s.Label
    }

    if ($any) {
        Write-Text $Ctx.Js ("/* ELECTRONFIX */`n" + $js)
        Write-Ok 'ELECTRON_RUN_AS_NODE fix applied'
    } else {
        Write-Miss 'no ELECTRON_RUN_AS_NODE sites matched'
    }
}
