# Start a process on a Windows desktop object of its own.
#
# A desktop is "a securable object that contains a logical display surface and
# windows" (Win32 docs). Only one desktop on the interactive window station is
# the input desktop - the one the user sees and types into - and a window on any
# other one is not on the screen at all, cannot be given focus, and does not
# appear in the taskbar. That is what the lab wants: not a window that hides
# itself after the fact, but a window that was never on your desktop.
#
# STARTUPINFO.lpDesktop is how a process is put there, and it has to be set at
# CreateProcess time, which is why this is not Start-Process.

param(
    [Parameter(Mandatory = $true)][string]$Desktop,
    [Parameter(Mandatory = $true)][string]$Exe,
    # Base64 UTF-16LE, because the command line is full of double quotes and a
    # -File argument goes through Windows command-line quoting on the way in,
    # which mangles them - the editor then starts with garbled arguments and
    # exits without a word. Same reason the string form of the runner uses
    # -EncodedCommand.
    [Parameter(Mandatory = $true)][string]$CommandLine64,
    [Parameter(Mandatory = $true)][string]$Cwd
)

$ErrorActionPreference = 'Stop'

# CreateProcess WRITES INTO lpCommandLine, so it needs a mutable buffer. A
# marshaled .NET string is not one: the call fails with a misleading
# ERROR_PATH_NOT_FOUND that reads as "your exe is wrong". StringBuilder is the
# documented way to declare it.
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct CcLabStartupInfo {
  public int cb; public string lpReserved; public string lpDesktop; public string lpTitle;
  public int dwX; public int dwY; public int dwXSize; public int dwYSize;
  public int dwXCountChars; public int dwYCountChars; public int dwFillAttribute;
  public int dwFlags; public short wShowWindow; public short cbReserved2;
  public IntPtr lpReserved2; public IntPtr hStdInput; public IntPtr hStdOutput; public IntPtr hStdError;
}

[StructLayout(LayoutKind.Sequential)]
public struct CcLabProcessInfo {
  public IntPtr hProcess; public IntPtr hThread; public int dwProcessId; public int dwThreadId;
}

public static class CcLabDesktop {
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr CreateDesktop(string name, IntPtr device, IntPtr mode, int flags, uint access, IntPtr sa);

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CreateProcess(string app, StringBuilder cmd, IntPtr pa, IntPtr ta,
    bool inherit, uint flags, IntPtr env, string cwd, ref CcLabStartupInfo si, out CcLabProcessInfo pi);
}
'@

$GENERIC_ALL = 0x10000000
# Opening an existing desktop of the same name is the same call: it returns the
# handle instead of failing, so a second lab reuses the first one's desktop.
$handle = [CcLabDesktop]::CreateDesktop($Desktop, [IntPtr]::Zero, [IntPtr]::Zero, 0, $GENERIC_ALL, [IntPtr]::Zero)
if ($handle -eq [IntPtr]::Zero) {
    "error CreateDesktop: $([ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error()).Message)"
    exit 1
}

$si = New-Object CcLabStartupInfo
$si.cb = [Runtime.InteropServices.Marshal]::SizeOf($si)   # an INSTANCE: SizeOf on the type throws here
$si.lpDesktop = $Desktop
$commandLine = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($CommandLine64))
$pi = New-Object CcLabProcessInfo

# env = NULL means the child inherits this process's environment, which is how
# the lab's USERPROFILE / HOME / CC_LAB_PORT reach the editor.
$ok = [CcLabDesktop]::CreateProcess($Exe, (New-Object System.Text.StringBuilder $commandLine),
    [IntPtr]::Zero, [IntPtr]::Zero, $false, 0, [IntPtr]::Zero, $Cwd, [ref]$si, [ref]$pi)

if (-not $ok) {
    "error CreateProcess: $([ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error()).Message)"
    exit 1
}
# The desktop object lives only while a handle to it is open OR a thread is
# associated with it, and this process holds the only handle. Exiting the moment
# CreateProcess returns destroys the desktop out from under the editor before it
# has attached: it then dies without writing a single log line, and CreateProcess
# has already reported success. So wait until the child's GUI is up, which is
# what WaitForInputIdle blocks for - not a sleep, and not a poll.
$child = $null
try { $child = Get-Process -Id $pi.dwProcessId -ErrorAction Stop } catch { }
if ($child) { [void]$child.WaitForInputIdle(30000); $child.Refresh() }
"pid $($pi.dwProcessId) alive=$(if ($child -and -not $child.HasExited) { 'True' } else { 'False' })"
