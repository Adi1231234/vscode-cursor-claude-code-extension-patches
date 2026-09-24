# Input RTL - dir=auto on the composer + mention mirror so mixed-direction input
# renders correctly. Injected right after the ZOOM script. The runtime lives in
# open.js (the <script> opener) and dir.js, with the shared observer between
# them; this only joins them, fills the placeholders and injects.
#
# This is the first injected script in document order that needs the shared
# runtime, so it is where lib/js/ccDom.js and ccWatch.js are first defined - every
# later copy is a no-op behind the same window guard.
function Invoke-Patch {
    param($Ctx)
    $parts = @(
        (Join-Path $PSScriptRoot 'open.js'),
        (Get-LibJsPath 'ccDom.js'),
        (Get-LibJsPath 'ccWatch.js'),
        (Join-Path $PSScriptRoot 'dir.js')
    )
    $script = ($parts | ForEach-Object { Read-Text $_ }) -join ''
    $script = Expand-JsTokens $script ([ordered]@{
        '__NONCE__'    = $Ctx.Nonce
        '__MSGINPUT__' = $Ctx.MessageInputClass
        '__MIRROR__'   = $Ctx.MentionMirrorClass
    })
    Add-ScriptAfterMarker $Ctx $script '/* INPUTRTL */' 'input-rtl' @('/* ZOOM */')
}
