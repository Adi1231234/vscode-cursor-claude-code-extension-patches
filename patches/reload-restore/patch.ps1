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

        # (1) session id through deserialize (runtime: js/session-id.js, __STATE__ -> ${3})
        $rx1 = '(deserializeWebviewPanel\((\w+),(\w+)\)\{[\s\S]{0,200}?\w+\.setupPanel\(\2,)void 0(,void 0,\w+\))'
        if ($js -match $rx1) {
            $sid = Get-InjectedJs (Join-Path $PSScriptRoot 'js/session-id.js') @{ '__STATE__' = '${3}' }
            $js = [regex]::Replace($js, $rx1, ('${1}' + $sid + '${4}'))
            $applied = $true; Write-Ok 'session-restore (deserialize passes sessionID)'
        } else { Write-Miss 'deserialize anchor not found' }

        # (2) recovery: re-load an iframe that never started (runtime: js/blank-iframe-recovery.js)
        # The trailing `{` is what separates the definition from the call sites,
        # which pass expressions rather than four bare identifiers; matching the
        # body's first statement instead would break on every refactor of it.
        $sig = [regex]::Match($js, 'setupPanel\((\w),(\w),(\w),(\w)\)\{')
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

        # (3) git worktree list timeout 5s -> 20s (runtime value: js/timeout.js)
        $rxT = '("worktree","list","--porcelain"\],\{cwd:\w+,timeout:)5000(,windowsHide)'
        if ($js -match $rxT) {
            $timeout = Get-InjectedJs (Join-Path $PSScriptRoot 'js/timeout.js')
            $js = [regex]::Replace($js, $rxT, ('${1}' + $timeout + '${2}'))
            $applied = $true; Write-Ok 'git-worktree-list timeout 5000->20000'
        } else { Write-Miss 'git-worktree-list timeout anchor not found' }

        if ($applied) { Write-Text $Ctx.Js ("/* RELOADFIX */`n" + $js) }
    }

    # ---------------- webview/index.js (runtime: js/activate-retry.js) ----------------
    if (-not (Test-Path $Ctx.WebJs)) { Write-Miss 'webview/index.js not found'; return }
    $wc = Read-Text $Ctx.WebJs
    if ($wc -match 'let __ra=function') { Write-Skip 'webview activate-retry already patched'; return }

    # The branch this replaces keeps changing shape around the same three names, so
    # both known shapes are anchored and the housekeeping statements are captured
    # whole and threaded back into the replacement rather than re-authored:
    #   __PRE__   runs once before the first attempt
    #   __FAIL__  runs when the retries are exhausted, before the new chat
    #   __CATCH__ runs if the call rejects
    # 2.1.240+ wraps the branch in a block and turns the old optional `cleanup(),`
    # into a compound statement; before that the branch was a bare statement with an
    # optional cleanup call and an optional `.catch`. A shape that matches neither is
    # a miss, never a guess.
    $rxBlock = 'else if\(([\w$]+)\.initialSession\)\{(if\([\w$]+!==\1\.initialSession\)[\w$]+\([\w$]*\);)([\w$]+)\.activateSessionFromServer\(\1\.initialSession,\1\.initialPrompt\)\.then\(\(([\w$]+)\)=>\{if\(!\4\)\{(.+?)\3\.createSession\(\{isExplicit:!1\}\)\.then\(\(([\w$]+)\)=>\{if\(\6&&\1\.initialPrompt\)\6\.initialPrompt\.value=\1\.initialPrompt\}\)\}\}\)\.catch\(\(\)=>\{(.+?)\}\)\}'
    $rxBare  = 'else if\(([\w$]+)\.initialSession\)([\w$]+)\.activateSessionFromServer\(\1\.initialSession,\1\.initialPrompt\)\.then\(\(([\w$]+)\)=>\{if\(!\3\)(?:([\w$]+)\(\),)?\2\.createSession\(\{isExplicit:!1\}\)\.then\(\(([\w$]+)\)=>\{if\(\5&&\1\.initialPrompt\)\5\.initialPrompt\.value=\1\.initialPrompt\}\)\}\)(?:\.catch\(\(\)=>[\w$]+\(\)\))?;'

    $m = [regex]::Match($wc, $rxBlock)
    if ($m.Success) {
        $tokens = [ordered]@{
            '__U__' = $m.Groups[1].Value; '__L__' = $m.Groups[3].Value
            '__G__' = $m.Groups[4].Value; '__V__' = $m.Groups[6].Value
            '__PRE__' = $m.Groups[2].Value; '__FAIL__' = $m.Groups[5].Value
            '__CATCH__' = $m.Groups[7].Value
        }
    } else {
        $m = [regex]::Match($wc, $rxBare)
        if (-not $m.Success) { Write-Miss 'activateSessionFromServer anchor not found'; return }
        $pcall = if ($m.Groups[4].Success) { $m.Groups[4].Value + '();' } else { '' }
        $tokens = [ordered]@{
            '__U__' = $m.Groups[1].Value; '__L__' = $m.Groups[2].Value
            '__G__' = $m.Groups[3].Value; '__V__' = $m.Groups[5].Value
            '__PRE__' = ''; '__FAIL__' = $pcall; '__CATCH__' = $pcall
        }
    }

    $rep = Get-InjectedJs (Join-Path $PSScriptRoot 'js/activate-retry.js') $tokens
    $wc = $wc.Replace($m.Value, $rep)
    Write-Text $Ctx.WebJs $wc
    Write-Ok 'webview activate-retry (no more silent new-chat)'
}
