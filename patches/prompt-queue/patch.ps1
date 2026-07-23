# Prompt Queue (Codex-style) - two parts:
#   queue.css -> appended to the webview stylesheet
#   queue.js  -> injected into extension.js after the INPUTRTL (or ZOOM) script
# The queue script uses the webview nonce and the image-preview class hash.
function Invoke-Patch {
    param($Ctx)

    # --- CSS ---
    $css = Read-Text $Ctx.Css
    if ($css -match '/\* QUEUE \*/') {
        Write-Skip 'queue CSS already present'
    } else {
        Add-Text $Ctx.Css ("`r`n`r`n" + (Read-Text (Join-Path $PSScriptRoot 'queue.css')))
        Write-Ok 'queue CSS appended'
    }

    # --- JS ---
    $js = Read-Text $Ctx.Js
    if ($js -match '/\* QUEUE \*/') { Write-Skip 'queue JS already patched'; return }

    $script = Read-Text (Join-Path $PSScriptRoot 'queue.js')
    $script = $script -replace '__NONCE__', $Ctx.Nonce
    $script = $script -replace '__PVHASH__', $Ctx.PvHash

    $anchor = $js.IndexOf('/* INPUTRTL */')
    if ($anchor -lt 0) { $anchor = $js.IndexOf('/* ZOOM */') }
    if ($anchor -ge 0) {
        $end = $js.IndexOf('</script>', $anchor) + '</script>'.Length
        $js = $js.Substring(0, $end) + "`n        " + $script + $js.Substring($end)
        Write-Text $Ctx.Js $js
        Write-Ok 'queue JS injected'
    } else {
        Write-Miss 'INPUTRTL/ZOOM anchor not found (run zoom/input-rtl first)'
    }
}
