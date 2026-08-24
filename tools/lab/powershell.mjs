/* Running a PowerShell script from the lab.

   -EncodedCommand, not -Command: a script passed as an argument goes through
   Windows command-line quoting on the way in, and any double quote inside it
   comes out mangled - the command then runs and returns *nothing*, which reads
   as "no such process" rather than as a bug. Base64 UTF-16LE has no such edge. */

import { spawn } from 'node:child_process';

export function powershell(script, capture = false) {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    return new Promise((resolve, reject) => {
        const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true });
        let out = '';
        if (capture) p.stdout.on('data', (d) => { out += d; });
        p.on('error', reject);
        p.on('exit', () => resolve(out));
    });
}

/* A path going into a single-quoted PowerShell literal. */
export const quote = (s) => s.replace(/'/g, "''");
