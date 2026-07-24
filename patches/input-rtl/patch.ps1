# Input RTL - dir=auto on the composer + mention mirror so mixed-direction input
# renders correctly. Injected right after the ZOOM script. The runtime lives in
# input-rtl.js (formatted JS); this only fills the placeholders + injects.
function Invoke-Patch {
    param($Ctx)
    $script = Get-InjectedJs (Join-Path $PSScriptRoot 'input-rtl.js') ([ordered]@{
        '__NONCE__'    = $Ctx.Nonce
        '__MSGINPUT__' = $Ctx.MessageInputClass
        '__MIRROR__'   = $Ctx.MentionMirrorClass
    })
    Add-ScriptAfterMarker $Ctx $script '/* INPUTRTL */' 'input-rtl' @('/* ZOOM */')
}
