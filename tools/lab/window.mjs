/* Getting the lab's window back on screen.

   A minimized window is delivered no mouse input. Not "input": *mouse* input -
   `Input.dispatchKeyEvent` still arrives, which is the trap. Measured, with the
   lab window minimized: twelve `mouseMoved` events reached a capture-phase
   listener on window, and the `mousePressed` between them did not arrive at all,
   so the sash never picked up the drag and the panel stayed at 760px - while
   `Ctrl+Shift+P` in the same window opened the palette every time. The result is
   a harness where `repatch` works and `width` quietly does nothing, and nothing
   in either says the window is the reason.

   `--disable-features=CalculateNativeWinOcclusion` does not cover this: it stops
   a *covered* window being marked hidden, and a minimized one is hidden anyway.
   CDP cannot fix it either - Electron does not implement the Browser domain, so
   `Browser.getWindowForTarget` is "wasn't found" and `Page.bringToFront` returns
   without the window coming back. That leaves the OS call, which is what this is.

   Only the lab's own window: the processes are matched on the lab directory in
   their command line, the same way `stop` does it, so a minimized editor of the
   user's own is never touched. Restoring, not raising - the window has to be on
   screen, it does not have to steal focus. */

import { powershell, quote } from './powershell.mjs';

const SW_RESTORE = 9;

const SCRIPT = (dir) => `
Add-Type -Namespace CcLab -Name Win -MemberDefinition '
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
'
$ids = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${quote(dir)}*' } | ForEach-Object { $_.ProcessId })
$w = @(Get-Process -Id $ids -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })[0]
if (-not $w) { 'none'; exit }
$h = $w.MainWindowHandle
$was = [CcLab.Win]::IsIconic($h)
if ($was) { [void][CcLab.Win]::ShowWindow($h, ${SW_RESTORE}); Start-Sleep -Milliseconds 700 }
"$was $([CcLab.Win]::IsIconic($h))"
`;

/* -> { found, wasMinimized, minimized }. `found: false` is not an error on its
   own: the caller decides whether it needed the window. */
export async function restoreWindow(lay) {
    const out = (await powershell(SCRIPT(lay.dir), true)).trim();
    if (!out || out === 'none') return { found: false, wasMinimized: false, minimized: false };
    const [was, now] = out.split(/\s+/);
    return { found: true, wasMinimized: was === 'True', minimized: now === 'True' };
}
