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
   proof the run reached the end rather than dying somewhere in the middle.

   The run itself is tools/apply-run.mjs: the way install.ps1 runs it, shared with
   the self-test and the perf check. */

import { REPO } from './paths.mjs';
import { runApply } from '../apply-run.mjs';

export function applyPatches(lay, log) {
    return new Promise((resolve, reject) => {
        const r = runApply({ repo: REPO, extensionsDir: lay.extensions });
        const stop = (why) => reject(new Error(`${why}\n${r.out.trim()}`));
        if (r.failures.length) return stop(`apply.ps1: ${r.failures.length} patch(es) threw`);
        if (r.code) return stop(`apply.ps1 exited ${r.code}`);
        if (!r.ok) return stop('apply.ps1 patched nothing');
        /* Reached the end, or died between two patches with [ok]s behind it. */
        if (!r.finished) return stop('apply.ps1 stopped before the end - the install is only partly patched');

        log(`apply.ps1: ${r.ok} sites patched${r.misses.length ? `, ${r.misses.length} missed` : ''}`);
        for (const m of r.misses) log(`  [miss] ${m}`);
        resolve({ ok: r.ok, misses: r.misses });
    });
}
