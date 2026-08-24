#!/usr/bin/env node
/* One command to get a patched bundle running in a real editor. `--help` prints
   the whole surface; tools/lab/README.md says what each step is guarding
   against, all of which fails silently if you do it by hand.

   Nothing here can reach your own editor: the lab has its own extensions dir,
   its own user-data dir, and its own home, so even its CDP port comes from a
   private argv.json rather than the one your install reads. */

import { readFileSync, rmSync } from 'node:fs';
import { evalInPanel } from '../cdp/panels.mjs';
import { runCommand } from '../cdp/palette.mjs';
import { targets } from '../cdp/client.mjs';
import { DEFAULT_PORT, detectVersion, layout } from './paths.mjs';
import { launch, portOwner, stop, useCodeExe, waitForPort } from './editor.mjs';
import { ensurePanel, waitForPanel } from './panel.mjs';
import { applyPatches } from './patches.mjs';
import { parse, usage } from './args.mjs';
import { makeReport } from './report.mjs';
import { hideWindow } from './window.mjs';
import * as profile from './profile.mjs';
import * as vsix from './vsix.mjs';

const log = (m) => console.error(`[lab] ${m}`);

function fail(message) {
    console.error(`[lab] ${message}`);
    process.exit(1);
}

const { cmd, args, flags } = parse(process.argv.slice(2));
/* Asking for help succeeds; being given nothing to do is a usage error. */
if (!cmd || flags.help) usage(flags.help ? 0 : 1);
/* The CDP client is built on the global WebSocket, which is Node 22. Say so
   here rather than letting it surface as "WebSocket is not defined". */
if (typeof WebSocket === 'undefined') fail(`needs Node 22+ for its CDP client, this is ${process.version}`);

const version = flags.version || detectVersion();
if (!version) fail('no claude-code install found to take a version from - pass --version 2.1.241');
const port = Number(flags.port || DEFAULT_PORT);
try { if (flags.code) useCodeExe(flags.code); } catch (e) { fail(e.message); }
const lay = layout(version, port);
const report = makeReport({ lay, port, version, log, flags });

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
    if (!(await waitForPort(port))) fail('the editor never opened its CDP port - see the lab\'s own main.log');
    /* Out of the way for the rest of its life. Everything below drives it over
       CDP, so it never needs the desktop again. */
    const hid = await hideWindow(lay).catch(() => null);
    log(hid && hid.minimized ? 'window minimized - the lab is driven over CDP, not on screen' : 'could not minimize the lab window - it will sit on your desktop');
    await report(await ensurePanel(port, log));
}

async function repatch() {
    if ((await claimPort()) !== 'ours') fail('this lab is not running - `lab.mjs up` first');
    await vsix.restore(lay);
    await applyPatches(lay, log);
    const page = (await targets(port)).find((t) => t.type === 'page' && t.title);
    if (!page) fail('the lab has no editor window to reload');
    const r = await runCommand(page, 'Developer: Reload Window');
    /* The window state travels with the refusal: which of the reasons it was
       decides what to do about it, and guessing costs a whole debugging session. */
    if (!r.ok) fail(`reload refused: ${r.reason}${r.window ? `
  window: ${JSON.stringify(r.window)}` : ''}`);
    const panel = await waitForPanel(port);
    if (!panel) fail('the panel did not come back after the reload');
    await report(panel);
}

/* Width is a test parameter: `width 300` puts the panel in the narrow regime
   where edge-placed UI actually breaks. With no argument it just reports. */
async function width(px) {
    if ((await claimPort()) !== 'ours') fail('this lab is not running - `lab.mjs up` first');
    await report(await ensurePanel(port, log), px ?? flags.width);
}

async function evaluate(file) {
    if (!file) fail('eval needs a script file: lab.mjs eval <script.js>');
    if ((await claimPort()) !== 'ours') fail('this lab is not running - `lab.mjs up` first');
    const panel = await ensurePanel(port, log);
    /* The lab runs minimized, and a minimized window is never laid out again - so
       every rect, every clientWidth, every media query answers with the geometry
       the panel had when it was last on screen. Reading state is fine; measuring
       is not, and the difference is invisible in the numbers. */
    const hidden = await evalInPanel(panel.target, 'document.visibilityState !== "visible"');
    if (hidden === true) log('the panel is not on screen, so its geometry is frozen - `lab.mjs width <px>` to lay it out again');
    const result = await evalInPanel(panel.target, readFileSync(file, 'utf8'));
    console.log(JSON.stringify(result, null, 1));
    process.exit(result && result.__error ? 1 : 0);
}

async function down() {
    const killed = await stop(lay).catch(() => 0);
    log(killed ? `editor stopped (${killed} processes)` : 'nothing was running for this lab');
    if (!flags.purge) return;
    rmSync(lay.dir, { recursive: true, force: true });
    log(`removed ${lay.dir} (the vsix cache is kept)`);
}

const COMMANDS = { up, repatch, down, eval: () => evaluate(args[0]), width: () => width(args[0]) };

try {
    if (!COMMANDS[cmd]) fail(`unknown command "${cmd}" - one of: ${Object.keys(COMMANDS).join(', ')}`);
    await COMMANDS[cmd]();
} catch (e) {
    fail(e && e.message ? e.message : String(e));
}
