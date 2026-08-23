/* Running the repo's own apply.ps1 against the lab, and refusing to go on if it
   did not actually patch anything.

   `apply.ps1` reports per site and always exits 0, so a silent [miss] - the
   usual sign that an anchor stopped matching in a newer bundle - would
   otherwise reach the panel as "the patch does nothing" half an hour later.
   The lab reads its output and says so up front. */

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { REPO } from './paths.mjs';

export function applyPatches(lay, log) {
    return new Promise((resolve, reject) => {
        const p = spawn('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-File', join(REPO, 'apply.ps1'),
            '-ExtensionsDir', lay.extensions,
        ], { windowsHide: true });

        let out = '';
        p.stdout.on('data', (d) => { out += d; });
        p.stderr.on('data', (d) => { out += d; });
        p.on('error', reject);
        p.on('exit', () => {
            const misses = [...out.matchAll(/\[miss\]\s*(.+)/g)].map((m) => m[1].trim());
            const ok = (out.match(/\[ok\]/g) || []).length;
            if (!ok) return reject(new Error(`apply.ps1 patched nothing:\n${out.trim()}`));
            log(`apply.ps1: ${ok} sites patched${misses.length ? `, ${misses.length} missed` : ''}`);
            for (const m of misses) log(`  [miss] ${m}`);
            resolve({ ok, misses });
        });
    });
}
