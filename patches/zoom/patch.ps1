# Zoom (Ctrl+Scroll / pinch), persisted in localStorage. Injected after the
# webview's module <script> tag. Must run before input-rtl / prompt-queue.
# The runtime lives in zoom.js (formatted JS); this only fills __NONCE__ + injects.
function Invoke-Patch {
    param($Ctx)
    $script = Get-InjectedJs (Join-Path $PSScriptRoot 'zoom.js') @{ '__NONCE__' = $Ctx.Nonce }
    Add-ScriptAfterRegex $Ctx $script '(<script nonce="[^"]*" src="[^"]*" type="module"></script>)' '/* ZOOM */' 'zoom'
}
