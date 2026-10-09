# Phone queue: /queue in the Claude app (Remote Control) sees and steers the
# panel's prompt queue. Four pieces, every anchor resolved before a byte is
# written - a /queue command with no host behind it answers nothing:
#
#   <ext>/<ModDir>   the Claude Code mod (mod/), copied beside extension.js
#   extension.js     the host runtime (host/panels.js + host/server.js)
#                    prepended, a __ccphone hook on every chat webview, and two
#                    edits to the CLI spawn: --plugin-dir for the mod
#                    (extraArgs) and the server's address (env, last, so it
#                    wins over one inherited from whatever started the editor)
#   extension.js     the panel script (webview/link.js), after the queue's,
#                    because it drives window.__qRemote, which that one defines
#
# Mods need Claude Code 2.1.287 or later; on an older CLI the flag is accepted
# and the mod simply does not load.
$ModDir = 'patches-mods/phone-queue'
# Mods ship in 2.1.287. Below it there is nothing for the mod to run in, and the
# spawn code is shaped differently anyway (2.1.280 has no env anchor of this
# shape) - so an older install is left alone with the reason, not a [miss] that
# reads like drift.
$MinVersion = [version]'2.1.287'

function Copy-ModTree {
    param([string]$From, [string]$To)
    foreach ($f in Get-ChildItem $From -Recurse -File -Force) {
        $dest = Join-Path $To $f.FullName.Substring($From.Length).TrimStart('\', '/')
        New-Item -ItemType Directory -Force (Split-Path $dest -Parent) | Out-Null
        Write-Text $dest (Read-Text $f.FullName)
    }
}

# Insert $New right after the single match of $Rx, or $null when it does not
# match exactly once - two spawn sites would mean the anchor no longer knows
# which one it is looking at. $Literal: the text right after the identifier a
# pattern opens with, so the search starts there (lib/Anchor.ps1) instead of
# trying every position of the bundle.
function Add-AfterOnly {
    param([string]$Text, [string]$Rx, [string]$New, [string]$Literal)
    $m = if ($Literal) { Find-IdentifierAnchored $Text $Literal $Rx } else { [regex]::Matches($Text, $Rx) }
    if ($m.Count -ne 1) { return $null }
    Set-MatchText $Text $m[0] ($m[0].Value + $New)
}

function Invoke-Patch {
    param($Ctx)

    if ($Ctx.Version -lt $MinVersion) {
        Write-Info "needs Claude Code $MinVersion or later for /queue (mods); this install is $($Ctx.Version) - left alone, update it in the editor"
        return
    }
    if (-not (Test-Path $Ctx.Js)) { Write-Miss 'extension.js not found'; return }
    $js = Read-Text $Ctx.Js
    if ($js.Contains('/* PHONEQUEUEHOST */')) { Write-Skip 'host already patched'; return }
    # The panel half drives the queue's own surface; without the queue's script
    # there is nothing to drive, and a host with no panel half would answer
    # every /queue with a timeout.
    if (-not $js.Contains('/* QUEUE */')) { Write-Miss 'the prompt-queue panel script is not there - nothing for /queue to drive'; return }

    # The SDK options spawnClaude builds: extraArgs (string-literal keys) and the
    # env assignment beside pathToClaudeCodeExecutable / executableArgs. That
    # assignment sits in spawnClaude's own body, where `this` is the panel's
    # comms object - host/env.js hands its `webview` to the server, which is how
    # a /queue finds the panel that spawned its CLI. Ours goes at the env
    # object's end: what is between its braces is captured, not spelled out,
    # and a nested object there is a miss rather than a guess.
    $js = Add-AfterOnly $js 'extraArgs:\{' (Read-Text (Join-Path $PSScriptRoot 'host/args.js')).Trim()
    if (-not $js) { Write-Miss 'CLI spawn extraArgs anchor not found exactly once'; return }
    $rxEnv = '([\w$]+)\.pathToClaudeCodeExecutable=[\w$]+,\1\.executableArgs=[\w$]+,\1\.env=\{[^{};]+(?=\})'
    $js = Add-AfterOnly $js $rxEnv (Read-Text (Join-Path $PSScriptRoot 'host/env.js')).Trim() '.pathToClaudeCodeExecutable='
    if (-not $js) { Write-Miss 'CLI spawn env anchor not found exactly once'; return }
    $js = Add-WebviewMessageHook $js (Join-Path $PSScriptRoot 'host/hook.js')
    if (-not $js) { Write-Miss 'webview message listener not found'; return }

    Copy-ModTree (Join-Path $PSScriptRoot 'mod') (Join-Path $Ctx.Dir $ModDir)
    $hostJs = (Read-Text (Join-Path $PSScriptRoot 'host/panels.js')).Trim() + "`n" +
              (Get-InjectedJs (Join-Path $PSScriptRoot 'host/server.js') @{ '__MODDIR__' = $ModDir }).Trim()
    Write-Text $Ctx.Js ("/* PHONEQUEUEHOST */`n" + $hostJs + "`n" + $js)
    Write-Ok "/queue host + mod ($ModDir)"

    $link = Get-InjectedJs (Join-Path $PSScriptRoot 'webview/link.js') @{ '__NONCE__' = $Ctx.Nonce }
    Add-ScriptAfterMarker $Ctx $link.Trim() '/* PHONEQUEUE */' '/queue panel link' @('/* QUEUE */')
}
