/* Running apply.ps1 the way install.ps1 runs it, and reading what it said.

   Every tool that runs apply.ps1 - the lab, its self-test, the perf check on every
   pull request - goes through here, so none of them can drift back to a different
   invocation. `powershell -File apply.ps1` and install.ps1's `& $apply` are not the
   same thing: under -File the functions apply.ps1 dot-sources from lib/ end up
   global, under & they are script-scoped, and a script block that only sees
   globals (a .GetNewClosure() closure) works in one and throws in the other. The
   lab and the perf check ran -File while every user ran &, so seven patches threw
   for users only, and nothing that runs on a pull request could see it (#135).

   Asynchronous on purpose: a run takes 5-16 s, and the perf check starts Chrome
   alongside it and waits for Chrome's port file with a watcher. A synchronous
   child blocked the event loop for the whole run, the watcher's event queued
   behind it, and the port timeout fired first - "Chrome did not open a debugging
   port" on CI, with Chrome up the whole time. */

import { spawn } from 'node:child_process';
import { join } from 'node:path';

const quotePs = (s) => `'${String(s).replace(/'/g, "''")}'`;

/* `exit $LASTEXITCODE` carries apply.ps1's own exit code out of -Command; apply.ps1
   states it itself, 0 or 1 (#138). Write-Host output reaches only a child process's
   stdout, which is why this is a child process at all. Resolved on 'close', after
   the output streams end, not on 'exit', which can come before the last lines. */
export function runApply({ repo, extensionsDir, skip = [] }) {
    const cmd = `& ${quotePs(join(repo, 'apply.ps1'))}`
        + (extensionsDir ? ` -ExtensionsDir ${quotePs(extensionsDir)}` : '')
        + (skip.length ? ` -Skip ${skip.map(quotePs).join(',')}` : '')
        + '; exit $LASTEXITCODE';
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
    return new Promise((resolve, reject) => {
        const p = spawn(shell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd],
            { cwd: repo, windowsHide: true });
        let out = '';
        p.stdout.setEncoding('utf8').on('data', (d) => { out += d; });
        p.stderr.setEncoding('utf8').on('data', (d) => { out += d; });
        p.on('error', reject);
        p.on('close', (code) => resolve({ out, code, ...readApply(out) }));
    });
}

/* What a run said: its [ok] sites, every [miss] and [fail] line, and whether it
   reached the closing Done line - the only proof it did not stop half way. */
export function readApply(out) {
    const grab = (tag) => [...out.matchAll(new RegExp(`\\[${tag}\\]\\s*(.+)`, 'g'))].map((m) => m[1].trim());
    return {
        ok: (out.match(/\[ok\]/g) || []).length,
        skips: (out.match(/\[skip\]/g) || []).length,
        misses: grab('miss'),
        failures: grab('fail'),
        finished: /\nDone \(/.test(out),
    };
}
