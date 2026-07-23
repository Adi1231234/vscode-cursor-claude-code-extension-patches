# ELECTRON_RUN_AS_NODE leak fix. Cursor sets ELECTRON_RUN_AS_NODE=1 on its
# extension host; the extension re-spreads process.env unfiltered into every env
# it builds for the child CLI, leaking the flag into every subprocess the CLI
# spawns. Strip it at each construction site. Each site is optional (some may not
# exist on a given version); the patch applies whatever it finds.
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js -match '/\* ELECTRONFIX \*/') { Write-Skip 'already patched'; return }

    $sites = @(
        @{ Old = 'function Id(e){let t=lfe(Tn("environmentVariables")),r={...process.env};';
           New = 'function Id(e){let t=lfe(Tn("environmentVariables")),r={...process.env};delete r.ELECTRON_RUN_AS_NODE;';
           Label = 'Id() env builder' }
        @{ Old = 'env:c={...process.env}';
           New = 'env:c=(({ELECTRON_RUN_AS_NODE:__erdA,...__envRestA})=>__envRestA)(process.env)';
           Label = 'SDK transport initialize() default env' }
        @{ Old = '{...process.env,...e.env}';
           New = '(({ELECTRON_RUN_AS_NODE:__erdB,...__baseB})=>({...__baseB,...e.env}))(process.env)';
           Label = 'auth spawn (...e.env)' }
        @{ Old = '{...process.env,...r.env}';
           New = '(({ELECTRON_RUN_AS_NODE:__erdC,...__baseC})=>({...__baseC,...r.env}))(process.env)';
           Label = 'runClaudeCommandRaw (...r.env)' }
    )

    $any = $false
    foreach ($s in $sites) {
        if ($js.Contains($s.Old)) { $js = $js.Replace($s.Old, $s.New); $any = $true; Write-Ok $s.Label }
        else { Write-Miss ($s.Label + ' not found') }
    }

    if ($any) {
        Write-Text $Ctx.Js ("/* ELECTRONFIX */`n" + $js)
        Write-Ok 'ELECTRON_RUN_AS_NODE fix applied'
    } else {
        Write-Miss 'no ELECTRON_RUN_AS_NODE sites matched'
    }
}
