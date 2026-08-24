/* Running PowerShell from the lab, as a script string or as a script file.

   -EncodedCommand, not -Command: a script passed as an argument goes through
   Windows command-line quoting on the way in, and any double quote inside it
   comes out mangled - the command then runs and returns *nothing*, which reads
   as "no such process" rather than as a bug. Base64 UTF-16LE has no such edge.
   A script *file* has no such problem and takes named parameters, so anything
   longer than a couple of lines lives in its own .ps1 and comes through here
   with `args`. */

import { spawn } from 'node:child_process';

export function powershell(script, capture = false, { env, args } = {}) {
    const invocation = args
        ? ['-File', script, ...args]
        : ['-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')];
    return new Promise((resolve, reject) => {
        const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...invocation], {
            windowsHide: true,
            env: env ? { ...process.env, ...env } : process.env,
        });
        /* stdout and stderr kept apart on purpose: callers parse stdout (a count, a
           command line, a pid), and PowerShell writes progress records and CLIXML
           noise to stderr, which turned `stop`'s process count into NaN when the two
           were concatenated. stderr is still worth having when a script fails
           without printing anything, so it stands in for an empty stdout. */
        let out = '';
        let err = '';
        if (capture) {
            p.stdout.on('data', (d) => { out += d; });
            p.stderr.on('data', (d) => { err += d; });
        }
        p.on('error', reject);
        p.on('exit', () => resolve(out.trim() ? out : err));
    });
}

/* A path going into a single-quoted PowerShell literal. */
export const quote = (s) => s.replace(/'/g, "''");
