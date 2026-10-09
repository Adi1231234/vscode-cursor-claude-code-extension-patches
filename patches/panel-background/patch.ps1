# Panel background - every panel on the editor's background, wherever it is open.
#
# The app paints a panel opened as an editor tab on the editor's background and
# one in the side bar on the side bar's, so panels of one window can differ.
# CSS only, and every declaration is the app's own editor-mode one (see the
# stylesheet); the class names are filled in from the bundle's CSS-module maps.
function Invoke-Patch {
    param($Ctx)
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'panel-background.css') '/* PANELBG */' 'panel background CSS'
}
