# Input RTL - dir=auto on the composer + mention mirror so mixed-direction input
# renders correctly. Injected right after the ZOOM script.
function Invoke-Patch {
    param($Ctx)
    $script = '<script nonce="${__NONCE__}">/* INPUTRTL */new MutationObserver(function(){document.querySelectorAll(".__MSGINPUT__:not([dir]),.__MIRROR__:not([dir])").forEach(function(e){e.dir="auto"})}).observe(document.body,{childList:true,subtree:true})</script>'
    $script = $script -replace '__NONCE__', $Ctx.Nonce -replace '__MSGINPUT__', $Ctx.MessageInputClass -replace '__MIRROR__', $Ctx.MentionMirrorClass
    Add-ScriptAfterMarker $Ctx $script '/* INPUTRTL */' 'input-rtl' @('/* ZOOM */')
}
