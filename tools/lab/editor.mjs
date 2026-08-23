/* Starting, finding and stopping the lab's editor.

   The CDP port is the awkward part. `--remote-debugging-port` on the command
   line is ignored; the switch is only honoured from `argv.json`, and VS Code
   reads that from **the home directory**, i.e. the same file the real install
   uses. Editing that file to test a patch is both racy and rude.

   So the lab gives the editor a home of its own: `USERPROFILE` (and `HOME`)
   point at the lab, `<lab>/home/.vscode/argv.json` carries the port, and the
   real `~/.vscode/argv.json` is never touched. A redirected home is also why
   `profile.mjs` has to hand the lab a copy of the credentials. */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function codeExe() {
    const candidates = [
        join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe'),
        join(process.env.ProgramFiles || '', 'Microsoft VS Code', 'Code.exe'),
        join(homedir(), 'AppData', 'Local', 'Programs', 'Microsoft VS Code', 'Code.exe'),
    ];
    const hit = candidates.find((p) => p && existsSync(p));
    if (!hit) throw new Error('Code.exe not found - pass --code <path to Code.exe>');
    return hit;
}

/* `Code.exe --install-extension` never returns - the executable is the GUI, and
   the arguments only mean "CLI" to `bin/code.cmd`, which re-runs the same binary
   with ELECTRON_RUN_AS_NODE. Anything that has to finish goes through here. */
export function runCli(args) {
    const cli = join(codeExe(), '..', 'bin', 'code.cmd');
    return new Promise((resolve, reject) => {
        const p = spawn('cmd.exe', ['/c', cli, ...args], { windowsHide: true });
        let out = '';
        p.stdout.on('data', (d) => { out += d; });
        p.stderr.on('data', (d) => { out += d; });
        p.on('error', reject);
        p.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`code.cmd exited ${code}: ${out.trim()}`))));
    });
}

/* `--disable-features=CalculateNativeWinOcclusion` is not a nicety. Windows
   occlusion detection flips a covered window to `visibilityState: "hidden"`,
   and a hidden page is not delivered input: `Input.dispatchKeyEvent` silently
   goes nowhere, so the palette never opens and every keyboard-driven step
   (opening the panel, a real Developer: Reload Window) fails the moment your
   own editor is in front of the lab - which it always is. */
export function launch(lay, port) {
    const child = spawn(codeExe(), [
        '--disable-features=CalculateNativeWinOcclusion',
        '--extensions-dir', lay.extensions,
        '--user-data-dir', lay.ud,
        '--new-window', lay.proj,
    ], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        env: { ...process.env, USERPROFILE: lay.home, HOME: lay.home, CC_LAB_PORT: String(port) },
    });
    child.unref();
}

export async function waitForPort(port, tries = 60, waitMs = 1000) {
    for (let i = 0; i < tries; i++) {
        const ok = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(3000) })
            .then((r) => r.ok).catch(() => false);
        if (ok) return true;
        await new Promise((r) => setTimeout(r, waitMs));
    }
    return false;
}

/* Kill only this lab: every process whose command line names the lab dir. The
   editor is a process tree, so matching on the path is what keeps a stray
   `Code.exe` of the user's own out of it. */
export async function stop(lay) {
    await powershell(
        `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${quote(lay.dir)}*' }`
        + ' | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }',
    );
}

/* Who is actually listening on the port. A port that answers is NOT proof the
   lab is up: another worktree's lab, or a hand-started editor, may hold it, and
   measuring that window while believing it is yours is a whole afternoon. */
export async function portOwner(port) {
    const out = await powershell(
        `$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1;`
        + ' if ($c) { (Get-CimInstance Win32_Process -Filter "ProcessId = $($c.OwningProcess)").CommandLine }',
        true,
    );
    return out.trim();
}

const quote = (s) => s.replace(/'/g, "''");

function powershell(script, capture = false) {
    return new Promise((resolve, reject) => {
        const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
        let out = '';
        if (capture) p.stdout.on('data', (d) => { out += d; });
        p.on('error', reject);
        p.on('exit', () => resolve(out));
    });
}
