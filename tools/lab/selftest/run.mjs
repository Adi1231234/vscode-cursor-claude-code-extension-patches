#!/usr/bin/env node
/* One command that checks the patcher and the lab still do what they claim.

     node tools/lab/selftest/run.mjs            against a lab that is already up
     node tools/lab/selftest/run.mjs --fresh    tear the lab down and rebuild it first

   Everything here runs without a conversation, so it costs nothing but time. The
   parts of a patch that only come alive once a session exists are not in here and
   cannot be - see "Testing a patch that needs a live session" in the README.

   It deliberately breaks a patch or two mid-run and puts them straight back, so
   the last check is that `git status` is clean again. If the suite is killed in
   the middle, `git checkout -- patches/` restores it. */

import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { DEFAULT_PORT, REPO, detectVersion, layout } from '../paths.mjs';
import { portOwner, waitForPort } from '../editor.mjs';
import { readWidth } from '../measure.mjs';
import { setWidth } from '../width.mjs';
import { claudePanels } from '../../cdp/panels.mjs';
import { staticChecks, bundleChecks } from './checks.mjs';
import { idempotency, missingAnchor, throwingPatch } from './apply.mjs';

const fresh = process.argv.includes('--fresh');
/* Everything except the width section works on a bundle alone, and the editor is
   the part most likely to be unavailable for reasons that have nothing to do with
   a patch - a VS Code installer holding the vscode-updating mutex will stop every
   launch for as long as any window is open, which is hours on a working machine.
   Without this the whole suite is lost to that, including the guard and
   template-literal checks that would have caught a real defect. */
const noEditor = process.argv.includes('--no-editor');
const port = Number((process.argv.find((a) => a.startsWith('--port=')) || '').split('=')[1] || DEFAULT_PORT);
const version = (process.argv.find((a) => a.startsWith('--version=')) || '').split('=')[1] || detectVersion();
const lay = layout(version, port);

let failed = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
};
const head = (title) => console.log(`\n== ${title} ==`);
/* Both streams: lab.mjs says what it did on stderr and prints its JSON on stdout,
   so reading only stdout loses every line these checks are about. */
const lab = (...args) => {
    const r = spawnSync(process.execPath, [join(REPO, 'tools/lab/lab.mjs'), ...args], { encoding: 'utf8', cwd: REPO });
    return String(r.stdout || '') + String(r.stderr || '');
};

head('the repo itself');
staticChecks(check);

head('the lab');
if (fresh) {
    console.log('   (--fresh: rebuilding from a purged lab, this takes a minute)');
    lab('down', '--purge');
}
const up = lab('up');
const started = !/already running, reusing it/.test(up);
/* With --no-editor the bundle still has to be patched - that is what every check
   below reads - so 'up' runs either way and only the panel is not required. */
if (!noEditor) check('the lab is up with a panel', /"panelWidth"/.test(up), up.trim().split('\n').slice(-2).join(' '));
if (started) {
    check('every site patched, nothing missed', /sites patched/.test(up) && !/\[miss\]/.test(up),
        (up.match(/apply\.ps1[^\n]*|\[miss\][^\n]*/g) || []).join(' | '));
    check('it is on a desktop of its own', /desktop of its own/.test(up),
        'without this the window sits on your screen and steals focus');
} else {
    console.log('SKIP  the launch checks - this lab was already up (--fresh to start a new one)');
}
check('nothing of the lab is on your desktop', ownWindows() === 0, `${ownWindows()} window(s) visible`);
if (!noEditor) check('the port belongs to this lab', (await waitForPort(port, 1)) && (await portOwner(port)).includes(lay.dir));

head('the patched bundles');
bundleChecks(check, lay);

head('the panel width');
const panel = noEditor ? null : (await claudePanels(port))[0];
if (noEditor) console.log('   (--no-editor: skipped)');
else if (!panel) check('a Claude panel is serving', false);
else {
    for (const want of [300, 1200, 150, 620]) {
        const w = await setWidth(port, panel, want);
        check(`width ${want} lands exactly`, w.inner === want, `panel ${w.inner}, window ${w.outer}`);
    }
    const w = await readWidth(panel, port);
    check('both sides of the iframe agree', w.settled, `panel ${w.inner}, window ${w.outer}`);
}

head('apply.ps1 when things go wrong');
idempotency(check, lay);
await throwingPatch(check, lay);
await missingAnchor(check, lay);
console.log('   (that left the bundles half-patched on purpose - putting them back)');
lab('repatch');

head('nothing was left behind');
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', cwd: REPO }).trim();
check('the working tree is clean again', !dirty, dirty.split('\n').slice(0, 4).join(' | '));

console.log(`\n${failed ? `${failed} FAILED` : 'all checks passed'} - the lab is still up; \`lab.mjs down\` when you are done.`);
process.exit(failed ? 1 : 0);

/* The lab's window must not exist on the interactive desktop at all. Its title
   ends with the workspace folder's name, which is always "proj". */
function ownWindows() {
    try {
        const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
            "@(Get-Process | Where-Object { $_.MainWindowTitle -like '*proj - Visual Studio Code' }).Count"],
        { encoding: 'utf8' });
        return Number(out.trim()) || 0;
    } catch { return 0; }
}
