# Reload restore - fixes blank / new-chat Claude tabs after "Reload Window".
# Four coupled sub-fixes across BOTH bundles (see this folder's README):
#   extension.js:  (1) pass the saved sessionID on deserialize (not void 0)
#                  (2) recovery: re-load a webview whose iframe never ran
#                  (3) bump the `git worktree list` timeout 5s -> 20s
#   webview/index.js: (4) retry activateSessionFromServer instead of new-chatting
# Every anchor captures the minified var names; a missing anchor just skips.
function Invoke-Patch {
    param($Ctx)

    # ---------------- extension.js (host) ----------------
    $js = Read-Text $Ctx.Js
    if ($js -match '/\* RELOADFIX \*/') {
        Write-Skip 'host reload fixes already patched'
    } else {
        $applied = $false

        # (1) session id through deserialize
        $rx1 = '(deserializeWebviewPanel\((\w+),(\w+)\)\{[\s\S]{0,200}?\w+\.setupPanel\(\2,)void 0(,void 0,\w+\))'
        if ($js -match $rx1) {
            $state = $matches[3]
            $js = [regex]::Replace($js, $rx1, ('${1}' + $state + '?.sessionID${4}'))
            $applied = $true; Write-Ok 'session-restore (deserialize passes sessionID)'
        } else { Write-Miss 'deserialize anchor not found' }

        # (2) recovery: re-load an iframe that never started
        $sig = [regex]::Match($js, 'setupPanel\((\w),(\w),(\w),(\w)\)\{let \w=\{isVisible')
        if ($sig.Success) {
            $pe = $sig.Groups[1].Value; $pt = $sig.Groups[2].Value; $pr = $sig.Groups[3].Value; $pn = $sig.Groups[4].Value
            $rx2 = '(\w\?\.fromClient\(\w\)\},null,this\.disposables\);)(let \w=\w\?[A-Za-z]+\.ViewColumn\.Active:' + $pe + '\.viewColumn;' + $pe + '\.onDidChangeViewState)'
            if ($js -match $rx2) {
                $rec = 'let __self=this,__loaded=!1,__att=0;let __md=' + $pe + '.webview.onDidReceiveMessage(function(){__loaded=!0;try{__md.dispose()}catch(_){}});let __try=function(){if(__loaded||__att>=3||!' + $pe + '.visible)return;__att++;try{' + $pe + '.webview.html=__self.getHtmlForWebview(' + $pe + '.webview,' + $pt + ',' + $pr + ',!1,' + $pn + ')}catch(_){}setTimeout(__try,3000)};setTimeout(__try,4000);' + $pe + '.onDidChangeViewState(function(){if(!__loaded&&' + $pe + '.visible)__try()});'
                $js = [regex]::Replace($js, $rx2, ('${1}' + $rec + '${2}'))
                $applied = $true; Write-Ok 'blank-iframe recovery'
            } else { Write-Miss 'setupPanel view-state anchor not found' }
        } else { Write-Miss 'setupPanel signature not found' }

        # (3) git worktree list timeout 5s -> 20s
        $rxT = '("worktree","list","--porcelain"\],\{cwd:\w+,timeout:)5000(,windowsHide)'
        if ($js -match $rxT) {
            $js = [regex]::Replace($js, $rxT, '${1}20000${2}')
            $applied = $true; Write-Ok 'git-worktree-list timeout 5000->20000'
        } else { Write-Miss 'git-worktree-list timeout anchor not found' }

        if ($applied) { Write-Text $Ctx.Js ("/* RELOADFIX */`n" + $js) }
    }

    # ---------------- webview/index.js ----------------
    if (-not (Test-Path $Ctx.WebJs)) { Write-Miss 'webview/index.js not found'; return }
    $wc = Read-Text $Ctx.WebJs
    if ($wc -match 'let __ra=function') { Write-Skip 'webview activate-retry already patched'; return }

    $rxR = 'else if\((\w)\.initialSession\)(\w)\.activateSessionFromServer\(\1\.initialSession,\1\.initialPrompt\)\.then\(\((\w)\)=>\{if\(!\3\)\2\.createSession\(\{isExplicit:!1\}\)\.then\(\((\w)\)=>\{if\(\4&&\1\.initialPrompt\)\4\.initialPrompt\.value=\1\.initialPrompt\}\)\}\);'
    $m = [regex]::Match($wc, $rxR)
    if ($m.Success) {
        $u = $m.Groups[1].Value; $l = $m.Groups[2].Value; $g = $m.Groups[3].Value; $v = $m.Groups[4].Value
        $rep = 'else if(' + $u + '.initialSession){let __ra=function(k){return ' + $l + '.activateSessionFromServer(' + $u + '.initialSession,' + $u + '.initialPrompt).then((' + $g + ')=>{if(' + $g + ')return;if(k<10){setTimeout(function(){__ra(k+1)},1000);return}' + $l + '.createSession({isExplicit:!1}).then((' + $v + ')=>{if(' + $v + '&&' + $u + '.initialPrompt)' + $v + '.initialPrompt.value=' + $u + '.initialPrompt})})};__ra(0)}'
        $wc = $wc.Replace($m.Value, $rep)
        Write-Text $Ctx.WebJs $wc
        Write-Ok 'webview activate-retry (no more silent new-chat)'
    } else {
        Write-Miss 'activateSessionFromServer anchor not found'
    }
}
