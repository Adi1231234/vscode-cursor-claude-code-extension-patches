# MCP reconnect all - one button in the MCP servers dialog that reconnects every
# server in it, the way its own per-server Reconnect does: the same session call,
# the same busy state, the same success/error line, and the list read again after.
# README.md.
#
#   (1) the dialog's own Reconnect handler, which names everything the button
#       needs: the call that clears the message line, the busy setter, the
#       session operations, the success and error setters, the list refresh
#   (2) the filter field's place in the dialog body: the button goes right
#       before it, under the same condition (servers loaded, none selected)
#   (3) the busy state's own name, from the hook that declares its setter
#   (4) webview/index.css - the gap under the button, its own guard
function Invoke-Patch {
    param($Ctx)

    if (-not (Test-Path $Ctx.WebJs)) { Write-Miss 'webview/index.js not found'; return }
    $wc = Read-Text $Ctx.WebJs
    if ($wc.Contains('/* MCPRECONNECTALL */')) { Write-Skip 'already patched'; return }

    # 1: handler  2: its argument  3: clear  4: set busy  5: operations  6: set
    # success  7: the caught error  8: set error  9: refresh
    $rxHandler = '([\w$]+)=[\w$]+\(async\(([\w$]+)\)=>\{([\w$]+)\(\),([\w$]+)\(\{server:\2,action:"reconnect"\}\);' +
                 'try\{await ([\w$]+)\.reconnectMcpServer\(\2\),([\w$]+)\(`Reconnected to \$\{\2\}`\)\}' +
                 'catch\(([\w$]+)\)\{([\w$]+)\(\7 instanceof Error\?\7\.message:"Failed to reconnect"\)\}' +
                 'finally\{\4\(null\),await ([\w$]+)\(\)\}'
    # 1: the condition  2: the server list  3: the jsx factory  (the filter field
    # follows) ... 4: the dialog's CSS-module map, read off the empty-state line
    $rxFilter = '(![\w$]+&&![\w$]+&&([\w$]+)\.length>0&&![\w$]+&&)([\w$]+)\([\w$]+,\{value:[\w$]+,onChange:[\w$]+,' +
                'placeholder:"Filter servers[^"]*",autoFocus:!0\}\),[^,]{0,80}?&&[\w$]+\("div",\{className:([\w$]+)\.emptyState'

    $mHandler = [regex]::Match($wc, $rxHandler)
    $mFilter = [regex]::Match($wc, $rxFilter)
    if (-not $mHandler.Success) { Write-Miss 'MCP dialog Reconnect handler not found'; return }
    if (-not $mFilter.Success) { Write-Miss 'MCP dialog filter field not found'; return }
    $h = $mHandler.Groups
    $f = $mFilter.Groups
    # 1: the busy state, declared with the setter the handler calls.
    $mBusy = [regex]::Match($wc, '\[([\w$]+),' + [regex]::Escape($h[4].Value) + '\]=[\w$]+\(null\)')
    if (-not $mBusy.Success) { Write-Miss 'MCP dialog busy state not found'; return }

    $button = Get-InjectedJs (Join-Path $PSScriptRoot 'sites/button.js') ([ordered]@{
        '__COND__'     = $f[1].Value
        '__JSX__'      = $f[3].Value
        '__CSS__'      = $f[4].Value
        '__SERVERS__'  = $f[2].Value
        '__BUSY__'     = $mBusy.Groups[1].Value
        '__SETBUSY__'  = $h[4].Value
        '__CLEAR__'    = $h[3].Value
        '__OPS__'      = $h[5].Value
        '__SETDONE__'  = $h[6].Value
        '__SETERROR__' = $h[8].Value
        '__REFRESH__'  = $h[9].Value
    })
    $wc = $wc.Substring(0, $mFilter.Index) + $button.Trim() + $wc.Substring($mFilter.Index)
    Write-Text $Ctx.WebJs $wc
    Write-Ok 'Reconnect all button in the MCP servers dialog'

    Add-StyleBlock $Ctx (Join-Path $PSScriptRoot 'button.css') '/* MCPRECONNECTALLCSS */' 'Reconnect all CSS'
}
