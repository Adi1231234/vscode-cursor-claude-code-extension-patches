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
# Every app class is named exactly, {{toolSummary}}, and filled in from the
# bundle's own CSS-module maps (lib/CssModules.ps1) - never matched by
# substring, which Blink cannot index (README: "Why exact classes").
function Invoke-Patch {
    param($Ctx)

    $styles = [ordered]@{
        'css/cards.css'    = '/* MSGCARDS */'
        'css/icons.css'    = '/* MSGCARDS-ICONS */'
        'css/terminal.css' = '/* MSGCARDS-TERM */'
        'css/rows.css'     = '/* MSGCARDS-ROWS */'
    }
    foreach ($s in $styles.GetEnumerator()) {
        Add-StyleBlock $Ctx (Join-Path $PSScriptRoot $s.Key) $s.Value "message-cards $($s.Key)"
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
    $x = Expand-CssClasses $Ctx (Expand-JsTokens $script ([ordered]@{ '__NONCE__' = $Ctx.Nonce }))
    if ($x.Missing.Count) { Write-Miss "message-cards JS: no single app class for $($x.Missing -join ', ')"; return }
    Add-ScriptAfterMarker $Ctx $x.Text '/* MSGCARDS */' 'message-cards JS' @('/* COPYMSG */', '/* QUEUE */', '/* INPUTRTL */', '/* ZOOM */')
}
