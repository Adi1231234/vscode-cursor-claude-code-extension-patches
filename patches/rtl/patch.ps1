# RTL text - right-to-left rendering for chat + dialogs (code blocks stay LTR).
function Invoke-Patch {
    param($Ctx)
    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'rtl.css') '/* RTL patch */' 'RTL CSS'
}
