/* Running the repo's own apply.ps1 against the lab, and refusing to go on unless
   it really did patch everything.

   `apply.ps1` reports per site, so a silent [miss] - the usual sign that an anchor
   stopped matching in a newer bundle - would otherwise reach the panel as "the
   patch does nothing" half an hour later. The lab reads its output and says so up
   front.

   Counting [ok] lines is not enough on its own. A patch that throws used to end the
   whole run, and a run that stopped a third of the way through still had plenty of
   [ok] behind it: the lab called that success and every measurement after it was of
   a half-patched bundle. So three things are checked now - no [fail], a non-zero
   exit is fatal, and the closing "Done" line has to be there, which is the only
   proof the run reached the end rather than dying somewhere in the middle. */

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { REPO } from './paths.mjs';

/* Invoked the way install.ps1 invokes it - `& <apply.ps1>` - and not with
   `-File`. The two are not equivalent: under `-File` the functions apply.ps1
   dot-sources from lib/ end up global, under `&` they are script-scoped, and a
   script block that only sees globals (a .GetNewClosure() closure) works in the
   first and throws in the second. The lab ran `-File` while every user ran `&`,
   so seven patches threw for users and passed here. `exit $LASTEXITCODE` carries
   apply.ps1's own exit code out of -Command. */
const quotePs = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function applyPatches(lay, log) {
    return new Promise((resolve, reject) => {
        const p = spawn('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-Command', `& ${quotePs(join(REPO, 'apply.ps1'))} -ExtensionsDir ${quotePs(lay.extensions)}; exit $LASTEXITCODE`,
        ], { windowsHide: true });

        let out = '';
        p.stdout.on('data', (d) => { out += d; });
        p.stderr.on('data', (d) => { out += d; });
        p.on('error', reject);
        p.on('exit', (code) => {
            const grab = (tag) => [...out.matchAll(new RegExp(`\\[${tag}\\]\\s*(.+)`, 'g'))].map((m) => m[1].trim());
            const misses = grab('miss');
            const failures = grab('fail');
            const ok = (out.match(/\[ok\]/g) || []).length;
            const finished = /\nDone \(/.test(out);

            const stop = (why) => reject(new Error(`${why}\n${out.trim()}`));
            if (failures.length) return stop(`apply.ps1: ${failures.length} patch(es) threw`);
            if (code) return stop(`apply.ps1 exited ${code}`);
            if (!ok) return stop('apply.ps1 patched nothing');
            /* Reached the end, or died between two patches with [ok]s behind it. */
            if (!finished) return stop('apply.ps1 stopped before the end - the install is only partly patched');

            log(`apply.ps1: ${ok} sites patched${misses.length ? `, ${misses.length} missed` : ''}`);
            for (const m of misses) log(`  [miss] ${m}`);
            resolve({ ok, misses });
        });
    });
}
