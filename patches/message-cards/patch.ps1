# Message cards - every action in its own place, as one card.
#   css/*.css   -> appended to the webview stylesheet, each under its own guard:
#                  the card and the rhythm, the tool icons, the terminal block,
#                  and the rows that are not commands (thinking, reply, prompt).
#   cards/*.js  -> fragments concatenated in the explicit $parts list below into
#                  one script, injected after copy-message's (falling back to the
#                  earlier links of the webview-script chain). 'config' opens the
#                  IIFE / <script>, 'observe' closes it; ccStore / ccDom / ccWatch
#                  are the shared store finder, write-on-change helpers and the
#                  one observer.
# Must run after message-time and copy-message: it restyles the stamp the first
# puts under each row and the button the second adds, and its rules win by
# coming later at the same weight.
#
# Every app class is named exactly (.toolSummary_<h>), never by substring
# ([class*="toolSummary_"]): Blink files a rule under the class its last part
# names, and a substring match can be filed under none, so it is tried on every
# element of the panel on every style pass (README: "Why exact classes").
# Each __KEY__ token is that key's class in the app's CSS-module map, resolved
# from the module hashes Extension.ps1 detected, and checked against the bundle
# before a byte is written.
function Invoke-Patch {
    param($Ctx)

    $modules = @(
        @{ Hash = $Ctx.MsgHash; Keys = 'messagesContainer', 'timelineMessage', 'userMessageContainer', 'userMessage', 'turn',
                                       'assistantActions', 'dotSuccess', 'dotFailure', 'dotProgress', 'dotWarning' }
        @{ Hash = $Ctx.ToolHash; Keys = 'root', 'toolSummary', 'toolNameText', 'toolNameTextSecondaryPlaintext', 'toolBody',
                                        'toolBodyGrid', 'toolBodyRow', 'toolBodyRowLabel', 'toolBodyRowContent' }
        @{ Hash = ($Ctx.ToolUseClass -replace '^toolUse_'); Keys = 'toolUse', 'toolResult' }
        @{ Hash = $Ctx.SecondaryLineHash; Keys = 'secondaryLine' }
        @{ Hash = $Ctx.InputRowHash; Keys = 'inputRow' }
        @{ Hash = $Ctx.MsgActionsHash; Keys = 'container' }
    )
    if (-not (Test-Path $Ctx.WebJs)) { Write-Miss 'webview/index.js not found'; return }
    $wc = Read-Text $Ctx.WebJs
    $tokens = [ordered]@{ '__NONCE__' = $Ctx.Nonce }
    foreach ($m in $modules) {
        foreach ($key in $m.Keys) {
            $class = "$($key)_$($m.Hash)"
            if (-not $m.Hash -or -not $wc.Contains("$($key):`"$class`"")) { Write-Miss "message-cards: no CSS-module class for $key"; return }
            $tokens['__' + ($key -creplace '([a-z])([A-Z])', '$1_$2').ToUpper() + '__'] = $class
        }
    }

    $styles = [ordered]@{
        'css/cards.css'    = '/* MSGCARDS */'
        'css/icons.css'    = '/* MSGCARDS-ICONS */'
        'css/terminal.css' = '/* MSGCARDS-TERM */'
        'css/rows.css'     = '/* MSGCARDS-ROWS */'
    }
    foreach ($s in $styles.GetEnumerator()) {
        Add-StyleBlock $Ctx (Join-Path $PSScriptRoot $s.Key) $s.Value "message-cards $($s.Key)" $tokens
    }

    $parts = @(
        (Join-Path $PSScriptRoot 'cards/config.js')
        (Get-LibJsPath 'ccStore.js')
        (Get-LibJsPath 'ccDom.js')
        (Get-LibJsPath 'ccWatch.js')
        (Join-Path $PSScriptRoot 'cards/badge.js')
        (Join-Path $PSScriptRoot 'cards/more.js')
        (Join-Path $PSScriptRoot 'cards/observe.js')
    )
    $script = ($parts | ForEach-Object { Read-Text $_ }) -join ''
    $script = Expand-JsTokens $script $tokens
    Add-ScriptAfterMarker $Ctx $script '/* MSGCARDS */' 'message-cards JS' @('/* COPYMSG */', '/* QUEUE */', '/* INPUTRTL */', '/* ZOOM */')
}
