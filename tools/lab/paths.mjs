/* Where the lab keeps its things, and which extension version it defaults to.

   Everything lives under one temp root, never in the repo and never in the real
   profile: the whole point is that a lab run cannot touch the editor you are
   working in. The VSIX cache sits beside the labs rather than inside one, so
   tearing a lab down does not throw away a 100MB download. */

import { existsSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(tmpdir(), 'cc-lab');
export const CACHE = join(ROOT, 'cache');
export const DEFAULT_PORT = 9555;
export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* A lab is identified by version *and* port, and gets a directory per pair.
   Two labs of the same version otherwise share one user-data dir, where the
   second launch joins the first instance instead of starting its own - which
   also makes "that port is taken, pass --port" the wrong advice. */
export function layout(version, port) {
    const dir = join(ROOT, `${version}-p${port}`);
    return {
        version,
        dir,
        home: join(dir, 'home'),
        ud: join(dir, 'ud'),
        udInstall: join(dir, 'ud-install'),
        proj: join(dir, 'proj'),
        pristine: join(dir, 'pristine'),
        extensions: join(dir, 'home', '.vscode', 'extensions'),
        vsix: join(CACHE, `claude-code-${version}.vsix`),
    };
}

/* The version to test, when none was asked for: the newest one already
   installed on this machine, so the lab mirrors what the user actually runs. */
export function detectVersion() {
    const dirs = ['.vscode', '.cursor', '.vscode-insiders']
        .map((d) => join(homedir(), d, 'extensions'))
        .filter((d) => existsSync(d))
        .flatMap((d) => readdirSync(d));
    const versions = dirs
        .map((n) => /^anthropic\.claude-code-(\d+\.\d+\.\d+)/i.exec(n))
        .filter(Boolean)
        .map((m) => m[1]);
    if (!versions.length) return null;
    return versions.sort(compareVersions).pop();
}

function compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
    return 0;
}
