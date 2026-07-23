# Input RTL - sets dir=auto on the composer + mention mirror so mixed-direction
# input renders correctly. Injected right after the ZOOM script.
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js -match '/\* INPUTRTL \*/') { Write-Skip 'already patched'; return }

    $script = '<script nonce="${__NONCE__}">/* INPUTRTL */new MutationObserver(function(){document.querySelectorAll(".__MSGINPUT__:not([dir]),.__MIRROR__:not([dir])").forEach(function(e){e.dir="auto"})}).observe(document.body,{childList:true,subtree:true})</script>'
    $script = $script -replace '__NONCE__', $Ctx.Nonce
    $script = $script -replace '__MSGINPUT__', $Ctx.MessageInputClass
    $script = $script -replace '__MIRROR__', $Ctx.MentionMirrorClass

    $zoomAt = $js.IndexOf('/* ZOOM */')
    if ($zoomAt -ge 0) {
        $end = $js.IndexOf('</script>', $zoomAt) + '</script>'.Length
        $js = $js.Substring(0, $end) + "`n        $script" + $js.Substring($end)
        Write-Text $Ctx.Js $js
        Write-Ok 'input-rtl injected'
    } else {
        Write-Miss 'ZOOM anchor not found (run the zoom patch first)'
    }
}
