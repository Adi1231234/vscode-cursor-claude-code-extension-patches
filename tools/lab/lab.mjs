#!/usr/bin/env node
/* One command to get a patched bundle running in a real editor.

     node tools/lab/lab.mjs up            # pristine install -> patched -> panel open
     node tools/lab/lab.mjs eval <s.js>   # run a script inside that panel
     node tools/lab/lab.mjs repatch       # pristine again -> apply.ps1 -> real reload
     node tools/lab/lab.mjs down [--purge]

   Nothing it does can reach your own editor: its own extensions dir, its own
   user-data dir, and its own home (so its CDP port lives in a private
   argv.json). See README.md for what each step is guarding against. */

import { readFileSync, rmSync } from 'node:fs';
import { evalInPanel } from '../cdp/panels.mjs';
import { runCommand } from '../cdp/palette.mjs';
import { targets } from '../cdp/client.mjs';
import { DEFAULT_PORT, detectVersion, layout } from './paths.mjs';
import { launch, portOwner, stop, waitForPort } from './editor.mjs';
import { ensurePanel, waitForPanel } from './panel.mjs';
import { applyPatches } from './patches.mjs';
import * as profile from './profile.mjs';
import * as vsix from './vsix.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : fallback;
};
const cmd = argv.find((a) => !a.startsWith('--')) || 'up';
const log = (m) => console.error(`[lab] ${m}`);

const version = flag('version', detectVersion());
if (!version) fail('no claude-code install found to take a version from - pass --version 2.1.241');
const port = Number(flag('port', DEFAULT_PORT));
const lay = layout(version);

function fail(message) {
    console.error(`[lab] ${message}`);
    process.exit(1);
}

/* A port that answers is not proof this lab is up - another worktree's lab may
   hold it, and then every measurement you take is of someone else's window. */
async function claimPort() {
    if (!(await waitForPort(port, 1))) return 'free';
    const owner = await portOwner(port);
    if (owner.includes(lay.dir)) return 'ours';
    fail(`port ${port} is held by something else - pass --port, or stop it first:\n  ${owner || '(owner not readable)'}`);
}

async function up() {
    if ((await claimPort()) === 'ours') {
        log('lab already running, reusing it');
        return report(await ensurePanel(port, log));
    }
    await vsix.ensureVsix(lay, log);
    if (await vsix.install(lay, log)) await vsix.snapshot(lay);
    if (!vsix.hasPristine(lay)) fail('no pristine copy of the bundles - `lab.mjs down --purge`, then up again');
    await profile.write(lay, port);
    /* Always pristine-then-apply, never apply over a patched bundle: a patch
       that already wrote its guard reports [skip], and the lab would quietly go
       on testing the code you replaced. */
    await vsix.restore(lay);
    await applyPatches(lay, log);
    log(`starting the editor on port ${port}`);
    launch(lay, port);
    if (!(await waitForPort(port))) fail('the editor never opened its CDP port');
    report(await ensurePanel(port, log));
}

function report(panel) {
    log(`ready: ${lay.dir}`);
    console.log(JSON.stringify({ port, version, window: panel.window, target: panel.target.id, dir: lay.dir }, null, 1));
}

async function repatch() {
    if ((await claimPort()) !== 'ours') fail('this lab is not running - `lab.mjs up` first');
    await vsix.restore(lay);
    await applyPatches(lay, log);
    const page = (await targets(port)).find((t) => t.type === 'page' && t.title);
    const r = await runCommand(page, 'Developer: Reload Window');
    if (!r.ok) fail(`reload refused: ${r.reason}`);
    const panel = await waitForPanel(port);
    if (!panel) fail('the panel did not come back after the reload');
    report(panel);
}

if (cmd === 'up') await up();
else if (cmd === 'repatch') await repatch();
else if (cmd === 'eval') {
    const file = argv.filter((a) => !a.startsWith('--')).slice(1)[0];
    if (!file) fail('eval needs a script file');
    if ((await claimPort()) !== 'ours') fail('this lab is not running - `lab.mjs up` first');
    const panel = await ensurePanel(port, log);
    const result = await evalInPanel(panel.target, readFileSync(file, 'utf8'));
    console.log(JSON.stringify(result, null, 1));
    process.exit(result && result.__error ? 1 : 0);
} else if (cmd === 'down') {
    await stop(lay).catch(() => {});
    log('editor stopped');
    if (argv.includes('--purge')) {
        rmSync(lay.dir, { recursive: true, force: true });
        log(`removed ${lay.dir} (the vsix cache is kept)`);
    }
} else fail(`unknown command: ${cmd}`);
