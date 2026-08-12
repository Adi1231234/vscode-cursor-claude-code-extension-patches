# Reads another process's environment block straight out of its PEB.
# The only way to see what a spawned child actually inherited - Get-Process does
# not expose it, and the CLI never logs its own env.
param([int]$ProcessId, [string]$Filter = 'ELECTRON_RUN_AS_NODE')

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Peb {
    [DllImport("ntdll.dll")]
    public static extern int NtQueryInformationProcess(IntPtr h, int cls, ref PROCESS_BASIC_INFORMATION pbi, int len, out int ret);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(int access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool ReadProcessMemory(IntPtr h, IntPtr addr, byte[] buf, int size, out IntPtr read);
    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr h);
    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_BASIC_INFORMATION {
        public IntPtr Reserved1; public IntPtr PebBaseAddress;
        public IntPtr Reserved2_0; public IntPtr Reserved2_1;
        public IntPtr UniqueProcessId; public IntPtr Reserved3;
    }
    public static byte[] Read(IntPtr h, IntPtr addr, int size) {
        byte[] b = new byte[size]; IntPtr got;
        if (!ReadProcessMemory(h, addr, b, size, out got)) throw new Exception("ReadProcessMemory failed at 0x" + addr.ToString("X"));
        return b;
    }
}
'@

$PROCESS_QUERY_INFORMATION = 0x0400; $PROCESS_VM_READ = 0x0010
$h = [Peb]::OpenProcess($PROCESS_QUERY_INFORMATION -bor $PROCESS_VM_READ, $false, $ProcessId)
if ($h -eq [IntPtr]::Zero) { throw "OpenProcess failed for pid $ProcessId" }
try {
    $pbi = New-Object Peb+PROCESS_BASIC_INFORMATION
    $ret = 0
    $st = [Peb]::NtQueryInformationProcess($h, 0, [ref]$pbi, [System.Runtime.InteropServices.Marshal]::SizeOf($pbi), [ref]$ret)
    if ($st -ne 0) { throw "NtQueryInformationProcess status 0x$($st.ToString('X'))" }

    # PEB+0x20 -> ProcessParameters; RTL_USER_PROCESS_PARAMETERS+0x80 -> Environment,
    # +0x3F0 -> EnvironmentSize (x64 layout).
    $paramsPtr = [BitConverter]::ToInt64([Peb]::Read($h, [IntPtr]([int64]$pbi.PebBaseAddress + 0x20), 8), 0)
    $envPtr    = [BitConverter]::ToInt64([Peb]::Read($h, [IntPtr]($paramsPtr + 0x80), 8), 0)
    $envSize   = [BitConverter]::ToInt64([Peb]::Read($h, [IntPtr]($paramsPtr + 0x3F0), 8), 0)
    if ($envSize -le 0 -or $envSize -gt 1MB) { $envSize = 64KB }

    $bytes = [Peb]::Read($h, [IntPtr]$envPtr, [int]$envSize)
    $vars = ([System.Text.Encoding]::Unicode.GetString($bytes) -split "`0") | Where-Object { $_ -match '=' }
    [pscustomobject]@{
        Pid       = $ProcessId
        VarCount  = $vars.Count
        Matches   = @($vars | Where-Object { $_ -like "*$Filter*" })
    }
} finally { [Peb]::CloseHandle($h) | Out-Null }
