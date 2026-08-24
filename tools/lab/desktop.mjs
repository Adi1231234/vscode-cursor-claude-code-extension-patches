/* Starting the editor where it cannot be in your way.

   A lab is left running while you work in your own editor, so its window must
   never appear or take focus - and there is no way to ask an Electron app for
   that. Every in-band answer is a dead end, each of which costs an hour to
   rediscover:

   - VS Code has no minimized window state: its own enum carries
     `Minimized // not used anymore` (src/vs/platform/window/electron-main/window.ts),
     and `newWindowDimensions` offers only default/inherit/offset/maximized/fullscreen.
   - Chromium has `--start-maximized` (chrome/common/chrome_switches.cc) and no
     `start-minimized` anywhere in its source.
   - `Start-Process -WindowStyle Minimized` sets `STARTUPINFO.wShowWindow`, which
     Windows uses only "if the nCmdShow parameter of ShowWindow is set to
     SW_SHOWDEFAULT". Chrome opts in - `BrowserDesktopWindowTreeHostWin::
     GetInitialShowState()` reads STARTUPINFO - Electron never defines that method
     and inherits `SW_SHOWNORMAL`. Measured: the window came up not minimized.
   - CDP cannot move it: Electron does not implement the Browser domain, so
     `Browser.getWindowForTarget` answers "wasn't found".

   Minimizing it afterwards is not good enough either, for two reasons that both
   showed up in use: the window is briefly on the screen before the call lands,
   and - worse - a minimized window runs no layout at all. Measured with the same
   `Emulation.setDeviceMetricsOverride` in both states: minimized, the workbench
   viewport went to 900 and then 1500 while the panel's iframe stayed at 659 both
   times; restored, the same calls gave 406 and then 1006 with the panel agreeing
   exactly. A lab that exists to reproduce width-dependent bugs cannot be a lab
   that never lays out, so the width would have to keep restoring the window -
   which is the flash and the focus grab all over again.

   So the window is never on your desktop in the first place. Windows lets a
   process be started on a desktop object of its own, and only the input desktop
   is on screen: a window on any other one cannot be shown, focused, or clicked.
   Measured with the editor started this way: zero windows visible from the normal
   desktop, CDP fully working, `document.visibilityState` "visible" - so the
   workbench lays out - and `width 300` / `width 1100` landing exactly, with the
   panel's own measurement agreeing both times.

   Nothing has to take the desktop away again. It lives only while a handle to it
   is open or a thread is attached to it, and the launcher's handle dies with the
   launcher, so the editor is the last thing holding it: enumerating the window
   station gives `Default` before, `cc-lab-...` and `Default` while the lab runs,
   and `Default` again both after `down` and after killing the processes outright.
   The same fact is the trap in the other direction - see desktop.ps1. */

import { join } from 'node:path';
import { powershell } from './powershell.mjs';

/* One desktop for every lab: they are keyed by version and port, and two labs
   sharing a desktop would still be two independent editors. */
export const desktopName = (lay) => `cc-lab-${lay.dir.replace(/[^a-z0-9]+/gi, '-').slice(-40)}`;

/* -> { ok: true, pid } | { ok: false, reason }. The caller decides what a failure
   means; nothing here falls back on its own. */
export async function launchOnDesktop(lay, exe, args, env) {
    const line = [exe, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
    const out = (await powershell(join(import.meta.dirname, 'desktop.ps1'), true, {
        env,
        args: ['-Desktop', desktopName(lay), '-Exe', exe, '-Cwd', lay.dir,
            '-CommandLine64', Buffer.from(line, 'utf16le').toString('base64')],
    })).trim();
    const pid = /^pid (\d+) alive=(\w+)/.exec(out);
    if (pid && pid[2] === 'True') return { ok: true, pid: Number(pid[1]) };
    if (pid) return { ok: false, reason: `the editor exited immediately on desktop ${desktopName(lay)}` };
    return { ok: false, reason: out.replace(/^error /, '') || 'the desktop launcher said nothing' };
}
