/* Keeping the lab off your screen.

   A lab is left running for an afternoon while you work in your own editor, so it
   must not take the screen or the keyboard. There is no way to ask for that in
   band, and it is worth writing down why, because all four obvious answers are
   dead ends and each one costs an hour to rediscover:

   - VS Code has no minimized window state. Its own enum says so:
     `WindowMode { Maximized, Normal, Minimized, Fullscreen }` with
     `Minimized // not used anymore` (src/vs/platform/window/electron-main/window.ts),
     and the one user-facing setting, `newWindowDimensions`, is
     'default' | 'inherit' | 'offset' | 'maximized' | 'fullscreen'.
   - There is no Chromium switch for it: `--start-maximized` exists in
     chrome/common/chrome_switches.cc, `start-minimized` appears nowhere.
   - `Start-Process -WindowStyle Minimized` does nothing. That sets
     `STARTUPINFO.wShowWindow`, which Windows documents as used "if the nCmdShow
     parameter of ShowWindow is set to SW_SHOWDEFAULT". Chrome opts in -
     `BrowserDesktopWindowTreeHostWin::GetInitialShowState()` reads STARTUPINFO -
     but Electron does not: `GetInitialShowState` appears nowhere in its source,
     so it inherits `DesktopWindowTreeHostWin::GetInitialShowState()`, which
     returns `CanActivate() ? SW_SHOWNORMAL : SW_SHOWNOACTIVATE`. Measured: the
     window came up not minimized.
   - `Page.bringToFront` and the CDP Browser domain cannot move it either -
     Electron does not implement `Browser.getWindowForTarget`.

   So the window is minimized right after launch, with the Win32 call whose
   documented purpose is exactly that. `SW_SHOWMINNOACTIVE` rather than
   `SW_MINIMIZE`: the second activates whatever is behind it, which is a focus
   change of its own.

   The one thing a minimized window cannot do is lay out. Measured, with the same
   `Emulation.setDeviceMetricsOverride` call in both states: minimized, the
   workbench viewport went to 900 and then 1500 while the panel's iframe stayed
   at 659 both times; restored, the same calls gave 406 and then 1006, with the
   panel's own measurement agreeing exactly. So anything that depends on layout -
   which is the width, and only the width - brackets itself with `show` and
   `hide`, and everything else runs minimized.

   Only the lab's own window: the processes are matched on the lab directory in
   their command line, the same way `stop` does it, so nothing of yours moves. */

import { powershell, quote } from './powershell.mjs';

const SW_SHOWMINNOACTIVE = 7;
const SW_RESTORE = 9;

const SCRIPT = (dir, cmd) => `
Add-Type -Namespace CcLab -Name Win -MemberDefinition '
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
'
$ids = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${quote(dir)}*' } | ForEach-Object { $_.ProcessId })
$w = @(Get-Process -Id $ids -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })[0]
if (-not $w) { 'none'; exit }
$h = $w.MainWindowHandle
$want = ${cmd} -eq ${SW_SHOWMINNOACTIVE}
if ([CcLab.Win]::IsIconic($h) -ne $want) { [void][CcLab.Win]::ShowWindow($h, ${cmd}); Start-Sleep -Milliseconds 500 }
[CcLab.Win]::IsIconic($h)
`;

/* -> { found, minimized }. `found: false` is not an error on its own - the window
   may simply not exist yet; the caller decides whether it cares. */
async function apply(lay, cmd) {
    const out = (await powershell(SCRIPT(lay.dir, cmd), true)).trim();
    if (!out || out === 'none') return { found: false, minimized: false };
    return { found: true, minimized: out === 'True' };
}

export const hideWindow = (lay) => apply(lay, SW_SHOWMINNOACTIVE);
export const showWindow = (lay) => apply(lay, SW_RESTORE);
