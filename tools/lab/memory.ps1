# Memory of one editor's whole process tree, by role, as Task Manager counts it.
#
#   powershell -File tools/lab/memory.ps1 <substring>
#
# <substring> picks the editor: a lab dir (%TEMP%\cc-lab\2.1.295-p9555) or an
# install path ("Microsoft VS Code"). Every process whose command line or exe
# names it is in, and so is everything they started (claude.exe, its MCP servers,
# language servers). See README "Measuring memory" for why each choice is made.
param([Parameter(Mandatory)][string]$Match)

$all = Get-CimInstance Win32_Process
# Private working set is Task Manager's Memory column; private bytes (commit) is
# reported beside it because it runs 1.5-2x higher on these processes.
$perf = @{}
Get-CimInstance Win32_PerfRawData_PerfProc_Process | ForEach-Object {
    $perf[[int]$_.IDProcess] = @{ ws = [double]$_.WorkingSetPrivate; pb = [double]$_.PrivateBytes }
}

$tree = @{}
$all | Where-Object { $_.CommandLine -like "*$Match*" -or $_.ExecutablePath -like "*$Match*" } |
    ForEach-Object { $tree[[int]$_.ProcessId] = $_ }
do {
    $grew = $false
    foreach ($p in $all) {
        if (-not $tree.ContainsKey([int]$p.ProcessId) -and $tree.ContainsKey([int]$p.ParentProcessId)) {
            $tree[[int]$p.ProcessId] = $p; $grew = $true
        }
    }
} while ($grew)

# Roles from each process's own switches: `code --status` names them exactly but
# answered nothing at all for some labs. The extension host is the NodeService
# utility that carries --inspect-port; anything under claude.exe is the CLI's.
function Get-Role($p) {
    $c = [string]$p.CommandLine
    for ($q = $p; $q; $q = $tree[[int]$q.ParentProcessId]) { if ($q.Name -eq 'claude.exe') { return 'claude.exe + its children' } }
    if ($p.Name -ne 'Code.exe') { return "other: $($p.Name)" }
    if ($c -match '--type=renderer') { return 'window + panel renderers' }
    if ($c -match '--type=gpu-process') { return 'gpu' }
    if ($c -match 'node\.mojom\.NodeService') { if ($c -match '--inspect-port=') { return 'extension host' } else { return 'shared / watcher / agent host' } }
    if ($c -match '--type=') { return 'other chromium' }
    $parent = $tree[[int]$p.ParentProcessId]
    if ($parent -and $parent.Name -eq 'Code.exe') { return 'started by an extension' }
    return 'main'
}

$rows = foreach ($p in $tree.Values) {
    $m = $perf[[int]$p.ProcessId]
    if ($m) { [pscustomobject]@{ Role = Get-Role $p; WS = $m.ws / 1MB; PB = $m.pb / 1MB } }
}
$rows | Group-Object Role | ForEach-Object {
    [pscustomobject]@{
        Role = $_.Name; Count = $_.Count
        'MB (Task Manager)' = [math]::Round(($_.Group | Measure-Object WS -Sum).Sum)
        'MB committed' = [math]::Round(($_.Group | Measure-Object PB -Sum).Sum)
    }
} | Sort-Object 'MB (Task Manager)' -Descending | Format-Table -AutoSize
'total {0} MB (Task Manager), {1} MB committed' -f [math]::Round(($rows | Measure-Object WS -Sum).Sum), [math]::Round(($rows | Measure-Object PB -Sum).Sum)
