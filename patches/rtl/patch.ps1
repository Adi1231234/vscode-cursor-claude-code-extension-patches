# RTL text - appends rtl.css to the webview stylesheet.
function Invoke-Patch {
    param($Ctx)
    $css = Read-Text $Ctx.Css
    if ($css -match '/\* RTL patch \*/') { Write-Skip 'RTL CSS already present'; return }
    Add-Text $Ctx.Css ("`r`n`r`n" + (Read-Text (Join-Path $PSScriptRoot 'rtl.css')))
    Write-Ok 'RTL CSS appended'
}
