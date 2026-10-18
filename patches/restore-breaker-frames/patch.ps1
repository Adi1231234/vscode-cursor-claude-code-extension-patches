# A reload replaced open conversations with empty chats when the panel could not
# paint. The restore breaker (2.1.301) marks an open as finished only after two
# animation frames; a panel that gets no frames never marks it, and two reloads
# like that make the tab skip its conversation. Fix: the frames race a timer, so
# a panel whose scripts still run settles the open the way a hidden one already
# does. The replacement lives in js/settle.js; __NAME__ and __DELAY__ map to the
# capture groups, so the function keeps its minified name and the app's delay.
function Invoke-Patch {
    param($Ctx)
    if (-not (Test-Path $Ctx.WebJs)) { Write-Miss 'webview/index.js not found'; return }
    $wc = Read-Text $Ctx.WebJs
    if ($wc.Contains('/* RESTOREFRAMES */')) { Write-Skip 'already patched'; return }
    # The breaker arrived in 2.1.301; before it there is nothing to fix. Its own
    # notice text says whether it is there, so a breaker that is present but
    # reshaped is still a [miss] below, never a quiet skip.
    if (-not $wc.Contains('did not finish opening the last')) {
        Write-Skip 'no restore breaker in this version (it arrived in 2.1.301)'
        return
    }

    # function <fn>(<cb>){let <a>,<b>,<go>=()=>{<a>=void 0,<b>=setTimeout(<cb>,<delay>)};
    #   if(document.visibilityState==="hidden")<go>();
    #   else <a>=requestAnimationFrame(()=>{<a>=requestAnimationFrame(<go>)});
    #   return()=>{if(<a>!==void 0)cancelAnimationFrame(<a>);clearTimeout(<b>)}}
    #
    # The whole function is the site - it is replaced, not added to - so its body
    # is matched as written and every name in it is captured. A body that changes
    # is a [miss], never a guess. Exactly one match in 2.1.301, none in 2.1.300
    # and before (the breaker is new in 2.1.301).
    $id = '([\w$]+)'
    $rx = "function $id\($id\)\{let $id,$id,$id=\(\)=>\{\3=void 0,\4=setTimeout\(\2,$id\)\};" +
          'if\(document\.visibilityState==="hidden"\)\5\(\);' +
          'else \3=requestAnimationFrame\(\(\)=>\{\3=requestAnimationFrame\(\5\)\}\);' +
          'return\(\)=>\{if\(\3!==void 0\)cancelAnimationFrame\(\3\);clearTimeout\(\4\)\}\}'
    $hits = [regex]::Matches($wc, $rx)
    if ($hits.Count -ne 1) {
        Write-Miss "restore breaker's frame wait not found ($($hits.Count) matches, expected 1)"
        return
    }

    $new = Get-InjectedJs (Join-Path $PSScriptRoot 'js\settle.js') ([ordered]@{
            '__NAME__'  = '${1}'
            '__DELAY__' = '${6}'
        })
    Write-Text $Ctx.WebJs ([regex]::Replace($wc, $rx, $new))
    Write-Ok 'an open settles without frames when the panel cannot paint'
}
