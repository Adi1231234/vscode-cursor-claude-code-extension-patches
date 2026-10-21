# Other sessions see a conversation under the title it was given in the panel
# (ListAgents, SendMessage), not under a name made from its folder (see
# README.md for the proof).
#
# Two sites in extension.js, both host methods every channel passes through:
#   channelInitialized - its CLI has started; a resumed session is known here
#   sessionIdArrived   - its CLI said which session it runs (first turn, fork)
# Each one's first statement becomes a call to __ccSessionName, which reads the
# session's newest title from its transcript and sends it to that CLI as a
# rename, once per channel and session. The host runtime lives in host/name.js
# and is prepended; the replaced signatures are js/*.js, whose placeholders map
# to the captured parameters (${n} backrefs). Both or neither: either one alone
# leaves one of the two cases unnamed.
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js.Contains('/* SESSIONNAMESYNC */')) { Write-Skip 'already patched'; return }

    $sites = @(
        @{ Rx = 'channelInitialized\(([\w$]+)\)\{'; Js = 'js/initialized.js'
           Subs = [ordered]@{ '__CH_ID__' = '${1}' } },
        @{ Rx = 'sessionIdArrived\(([\w$]+),([\w$]+),([\w$]+)\)\{'; Js = 'js/arrived.js'
           Subs = [ordered]@{ '__CH_ID__' = '${1}'; '__CH__' = '${2}'; '__SID__' = '${3}' } }
    )
    foreach ($s in $sites) {
        $n = ([regex]$s.Rx).Matches($js).Count
        if ($n -ne 1) { Write-Miss "$($s.Js) anchor matched $n times, expected 1"; return }
    }
    foreach ($s in $sites) {
        $head = (Get-InjectedJs (Join-Path $PSScriptRoot $s.Js) $s.Subs).Trim()
        $js = [regex]::Replace($js, $s.Rx, $head)
    }

    $parts = @((Get-LibJsPath 'ccProjects.js'), (Get-LibJsPath 'ccTranscript.js'),
               (Join-Path $PSScriptRoot 'host/name.js'))
    $runtime = ($parts | ForEach-Object { (Read-Text $_).Trim() }) -join "`n"
    Write-Text $Ctx.Js ("/* SESSIONNAMESYNC */`n" + $runtime + "`n" + $js)
    Write-Ok 'a session takes its panel title as the name other sessions see'
}
