# Zoom (Ctrl+Scroll / pinch) - injects a small script after the webview's module
# script tag. Must run before input-rtl and prompt-queue (they anchor after ZOOM).
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js -match '/\* ZOOM \*/') { Write-Skip 'already patched'; return }

    $script = '<script nonce="${__NONCE__}">/* ZOOM */let _z=parseFloat(localStorage.getItem("__zoom")||"1");document.body.style.zoom=_z;window.addEventListener("wheel",function(e){if(e.ctrlKey){e.preventDefault();_z=Math.min(3,Math.max(0.5,_z+(e.deltaY<0?0.02:-0.02)));document.body.style.zoom=_z;localStorage.setItem("__zoom",_z)}},{passive:false})</script>'
    $script = $script -replace '__NONCE__', $Ctx.Nonce

    $pattern = '(<script nonce="[^"]*" src="[^"]*" type="module"></script>)'
    if ($js -match $pattern) {
        $js = $js -replace $pattern, "`$1`n        $script"
        Write-Text $Ctx.Js $js
        Write-Ok 'zoom injected'
    } else {
        Write-Miss 'module script tag not found'
    }
}
