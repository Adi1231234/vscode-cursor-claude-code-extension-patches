# Remote Control pill - always the glyph, never the "Remote Control" label.
#
# Upstream's input footer row carries a pill: a phone glyph plus the words
# "Remote Control". It already ships an icon-only form of that pill, but behind
# its own fit logic - `[data-fit-stage="1"|"2"]`, set on the footer container by
# a ResizeObserver once the row stops fitting - so the glyph alone appeared only
# while the panel was narrow. This applies that same form at every width.
#
# CSS only, and every declaration in it is upstream's own (see the stylesheet),
# so nothing about how the pill looks is invented here. The one thing that has
# to be discovered is the CSS-module hash, which is detected in Extension.ps1
# and threaded in as __PILL__ rather than written down.
function Invoke-Patch {
    param($Ctx)
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'remote-control-pill-icon.css') `
        '/* RCPILLICON */' 'remote-control pill icon CSS' @{ '__PILL__' = $Ctx.PillClass }
}
