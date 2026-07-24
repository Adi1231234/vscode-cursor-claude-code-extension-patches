# Reload restore - fixes blank / new-chat Claude tabs after "Reload Window".
# Four coupled sub-fixes across BOTH bundles (see this folder's README):
#   extension.js:  (1) pass the saved sessionID on deserialize (not void 0)
#                  (2) recovery: re-load a webview whose iframe never ran
#                  (3) bump the `git worktree list` timeout 5s -> 20s
#   webview/index.js: (4) retry activateSessionFromServer instead of new-chatting
# The two injected runtimes live in js/*.js (formatted JS, __TOKEN__ placeholders
# for the captured minified names); this file only anchors, fills, and writes.
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

        # (2) recovery: re-load an iframe that never started (runtime: js/blank-iframe-recovery.js)
        $sig = [regex]::Match($js, 'setupPanel\((\w),(\w),(\w),(\w)\)\{let \w=\{isVisible')
        if ($sig.Success) {
            $rx2 = '(\w\?\.fromClient\(\w\)\},null,this\.disposables\);)(let \w=\w\?[A-Za-z]+\.ViewColumn\.Active:' + $sig.Groups[1].Value + '\.viewColumn;' + $sig.Groups[1].Value + '\.onDidChangeViewState)'
            if ($js -match $rx2) {
                $rec = Get-InjectedJs (Join-Path $PSScriptRoot 'js/blank-iframe-recovery.js') ([ordered]@{
                    '__PE__' = $sig.Groups[1].Value; '__PT__' = $sig.Groups[2].Value
                    '__PR__' = $sig.Groups[3].Value; '__PN__' = $sig.Groups[4].Value
                })
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

    # ---------------- webview/index.js (runtime: js/activate-retry.js) ----------------
    if (-not (Test-Path $Ctx.WebJs)) { Write-Miss 'webview/index.js not found'; return }
    $wc = Read-Text $Ctx.WebJs
    if ($wc -match 'let __ra=function') { Write-Skip 'webview activate-retry already patched'; return }

    $rxR = 'else if\((\w)\.initialSession\)(\w)\.activateSessionFromServer\(\1\.initialSession,\1\.initialPrompt\)\.then\(\((\w)\)=>\{if\(!\3\)\2\.createSession\(\{isExplicit:!1\}\)\.then\(\((\w)\)=>\{if\(\4&&\1\.initialPrompt\)\4\.initialPrompt\.value=\1\.initialPrompt\}\)\}\);'
    $m = [regex]::Match($wc, $rxR)
    if ($m.Success) {
        $rep = Get-InjectedJs (Join-Path $PSScriptRoot 'js/activate-retry.js') ([ordered]@{
            '__U__' = $m.Groups[1].Value; '__L__' = $m.Groups[2].Value
            '__G__' = $m.Groups[3].Value; '__V__' = $m.Groups[4].Value
        })
        $wc = $wc.Replace($m.Value, $rep)
        Write-Text $Ctx.WebJs $wc
        Write-Ok 'webview activate-retry (no more silent new-chat)'
    } else {
        Write-Miss 'activateSessionFromServer anchor not found'
    }
}
