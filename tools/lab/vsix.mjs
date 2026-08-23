/* Getting a genuinely pristine bundle into the lab, and keeping a copy of it.

   Two things this exists for:

   1. Every extension on a developer machine is already patched, and a patch
      writes a guard so a second run reports [skip] - so re-running apply.ps1
      over your own install proves nothing. The lab always starts from the
      OpenVSX download.
   2. The download must be *installed*, not unzipped: VS Code reads
      `extensions.json` in the extensions dir, and a hand-made folder beside it
      is not enough. `--install-extension` writes both. */

import { cp, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from './editor.mjs';

const BUNDLES = ['extension.js', 'webview/index.js', 'webview/index.css'];

const url = (v) =>
    `https://open-vsx.org/api/Anthropic/claude-code/win32-x64/${v}/file/Anthropic.claude-code-${v}@win32-x64.vsix`;

export async function ensureVsix(lay, log) {
    if (existsSync(lay.vsix)) return log(`vsix cached (${lay.version})`);
    await mkdir(join(lay.vsix, '..'), { recursive: true });
    log(`downloading ${lay.version} from OpenVSX (~110MB, once per version)`);
    const r = await fetch(url(lay.version));
    if (!r.ok) throw new Error(`OpenVSX said ${r.status} for ${lay.version}`);
    await writeFile(lay.vsix, Buffer.from(await r.arrayBuffer()));
    log('vsix downloaded');
}

/* Resolves to true only when it actually installed, so the caller knows this is
   the one moment the bundles on disk are guaranteed pristine. */
export async function install(lay, log) {
    if (extensionDir(lay)) { log('extension already installed in the lab'); return false; }
    await mkdir(lay.extensions, { recursive: true });
    await runCli([
        '--extensions-dir', lay.extensions,
        '--user-data-dir', lay.udInstall,
        '--install-extension', lay.vsix,
        '--force',
    ]);
    if (!extensionDir(lay)) throw new Error('install reported success but the extension is not there');
    log('extension installed (pristine)');
    return true;
}

export function extensionDir(lay) {
    if (!existsSync(lay.extensions)) return null;
    const hit = readdirSync(lay.extensions).find((n) => /^anthropic\.claude-code-/i.test(n));
    return hit ? join(lay.extensions, hit) : null;
}

/* The pristine bundles are kept aside the moment they are installed, so
   `repatch` can put them back without a re-install: a patch that already wrote
   its guard would otherwise skip, and the lab would keep testing the old code. */
export async function snapshot(lay) {
    const ext = extensionDir(lay);
    await mkdir(join(lay.pristine, 'webview'), { recursive: true });
    for (const f of BUNDLES) await cp(join(ext, f), join(lay.pristine, f), { force: true });
}

export async function restore(lay) {
    const ext = extensionDir(lay);
    for (const f of BUNDLES) await cp(join(lay.pristine, f), join(ext, f), { force: true });
}

export const hasPristine = (lay) => BUNDLES.every((f) => existsSync(join(lay.pristine, f)));
