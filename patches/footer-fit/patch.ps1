# Footer fit - the input footer row fits the panel at every width.
#
# The footer already fits itself: a ladder of stages (data-fit-stage 0..2) it
# climbs while its row does not fit. It stops at 2, where upstream's own buttons
# always fit and ours do not. This patch extends that same ladder: its own narrow
# form first, then our buttons folded one by one into an overflow menu, then a
# wrapped row. Every anchor is resolved before a byte is written.
#
#   (1) the ladder itself (`case 2: return 2`) hands every stage past 2 to
#       __ccFold.next
#   (2) the footer component: the stage the app renders from is capped at 2,
#       the rungs reach the row as data-cc-fit, and the overflow button is
#       rendered right before the send button
#   (3) the "+" menu's class map, which the overflow menu wears
#   (4) webview/index.css - the rules for each rung
function Invoke-Patch {
    param($Ctx)

    if (-not (Test-Path $Ctx.WebJs)) { Write-Miss 'webview/index.js not found'; return }
    if (-not $Ctx.FooterHash) { Write-Miss 'input-footer CSS module not found'; return }
    $wc = Read-Text $Ctx.WebJs
    if ($wc.Contains('/* FOOTERFIT */')) { Write-Skip 'already patched'; return }

    # (1) Anchored on the ladder's own shape: a fitter that grows a stage of its
    # own no longer matches, and is left alone rather than given two meanings.
    $rxLadder = 'switch\(([\w$]+)\)\{case 0:return 1;case 1:return 2;case 2:return 2\}'

    # (2) From the state hook that holds the stage, through the attribute that
    # publishes it, to the send button - the middle carried through verbatim.
    #   1: `[M,P]=x({stage:0,tick:0}),j=`   2: M   3: j
    #   4: up to and including `"data-fit-stage":`, then j
    #   5: up to the send button            6: the jsx factory   7: its call
    $rxFooter = '(\[([\w$]+),[\w$]+\]=[\w$]+\(\{stage:0,tick:0\}\),([\w$]+)=)\2\.stage' +
                '([\s\S]{0,6000}?"data-fit-stage":)\3' +
                '([\s\S]{0,6000}?)([\w$]+)(\("button",\{type:"submit")'

    # (3) The "+" menu's CSS-module map, found by its keys, not its hash.
    $rxMenu = 'var ([\w$]+)=\{(addButtonContainer:[^}]*)\}'

    $mLadder = [regex]::Match($wc, $rxLadder)
    $mFooter = [regex]::Match($wc, $rxFooter)
    $mMenu = [regex]::Match($wc, $rxMenu)
    if (-not $mLadder.Success) { Write-Miss 'footer fit-ladder anchor not found'; return }
    if (-not $mFooter.Success) { Write-Miss 'input-footer stage anchor not found'; return }
    if (-not $mMenu.Success) { Write-Miss 'add-button menu class map not found'; return }
    foreach ($key in 'addButton', 'addButtonSquare', 'menuPopup', 'menuItem', 'menuItemIcon', 'menuItemLabel') {
        if ($mMenu.Groups[2].Value -notmatch "(^|,)$($key):") { Write-Miss "add-button menu class map has no $key"; return }
    }

    $site = { param($name, $subs) (Get-InjectedJs (Join-Path $PSScriptRoot "sites/$name.js") $subs).Trim() }
    $g = $mFooter.Groups
    $state = @{ '__STATE__' = $g[2].Value }
    $footer = $g[1].Value + (& $site 'stage' $state) +
              $g[4].Value + $g[3].Value + (& $site 'attr' $state) +
              $g[5].Value + (& $site 'more' @{ '__JSX__' = $g[6].Value; '__MENU__' = $mMenu.Groups[1].Value }) +
              $g[6].Value + $g[7].Value
    $wc = Set-MatchText $wc $mFooter $footer

    # Matched again: the footer edit above may sit before the ladder.
    $mLadder = [regex]::Match($wc, $rxLadder)
    $wc = Set-MatchText $wc $mLadder (& $site 'ladder' @{ '__STAGE__' = $mLadder.Groups[1].Value })

    $runtime = (@('cut.js', 'fold.js', 'menu-items.js', 'menu.js', 'more.js') | ForEach-Object { Read-Text (Join-Path $PSScriptRoot "runtime/$_") }) -join "`n"
    Write-Text $Ctx.WebJs ("/* FOOTERFIT */`n" + $runtime + "`n" + $wc)
    Write-Ok "footer fit ladder + overflow menu (stage: $($g[2].Value).stage, menu css: $($mMenu.Groups[1].Value))"

    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'fit.css') '/* FOOTERFITCSS */' 'footer fit CSS' @{
        '__BTN__'     = "footerButton_$($Ctx.FooterHash)"
        '__PRIMARY__' = "footerButtonPrimary_$($Ctx.FooterHash)"
        '__SPACER__'  = "spacer_$($Ctx.FooterHash)"
        '__CHIP__'    = "selectionChip_$($Ctx.FooterHash)"
    }
}
