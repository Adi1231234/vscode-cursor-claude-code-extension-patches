# Zoom (Ctrl+Scroll / pinch), persisted in localStorage. Injected after the
# webview's module <script> tag. Must run before input-rtl / prompt-queue.
# The runtime lives in zoom.js (formatted JS); this only fills __NONCE__ + injects.
#
# The tag is matched by what identifies it - a module script with a src - with
# any attributes before the src: 2.1.310 gave it an id ahead of the nonce
# (id="${p44}", read by its new load-failure notice), and the old anchor, which
# spelled out `<script nonce=... src=...`, missed and took the whole webview
# chain (input-rtl, the queue, copy-message ...) down with it.
function Invoke-Patch {
    param($Ctx)
    $script = Get-InjectedJs (Join-Path $PSScriptRoot 'zoom.js') @{ '__NONCE__' = $Ctx.Nonce }
    Add-ScriptAfterRegex $Ctx $script '(<script(?: [\w-]+="[^"]*")* src="[^"]*" type="module"></script>)' '/* ZOOM */' 'zoom'
}
