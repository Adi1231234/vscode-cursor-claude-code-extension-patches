/* What apply.ps1 does when things go wrong, which is the part nobody exercises by
   hand: a second run must change nothing, a patch that throws must not pass for a
   patched install, and a missing anchor must leave the bundle untouched.

   Each of these deliberately breaks something in the repo and puts it straight
   back, so the working tree is the same afterwards - `git status` is part of the
   assertion, not an afterthought. */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from '../paths.mjs';
import * as vsix from '../vsix.mjs';
import { runApply as run } from '../../apply-run.mjs';

/* The way install.ps1 runs it (tools/apply-run.mjs), not -File: the two differ in
   what lib/ functions a closure can see, and only one of them is what users get. */
const runApply = (extensions) => run({ repo: REPO, extensionsDir: extensions });

const count = (out, tag) => (out.match(new RegExp(`\\[${tag}\\]`, 'g')) || []).length;

/* Edit a patch, run, put it back - whatever happens in between. */
function withBrokenPatch(rel, edit, body) {
    const file = join(REPO, 'patches', rel);
    const original = readFileSync(file, 'utf8');
    const broken = edit(original);
    if (broken === original) return { skipped: `could not break ${rel}` };
    writeFileSync(file, broken);
    try { return body(); } finally { writeFileSync(file, original); }
}

/* What "idempotent" means here changed, and this is the check that says so.

   It used to mean a second run skips everything: every patch guards itself and
   returns when its marker is already in the bundle. That is idempotent and it is
   also why an install patched last week never received this week version of a
   patch - every line said [skip], the run exited 0, and nothing changed.

   It now means a second run applies the whole set again, to a restored copy of
   the original, and lands on the same bytes. Same patches in, same bundle out -
   which is the property that was actually wanted, and unlike the old one it does
   not stop an edited patch from arriving. */
export function idempotency(check, lay) {
    /* the same way the checks below find it: the one claude-code dir in there */
    const bundle = join(lay.extensions,
        readdirSync(lay.extensions).find((d) => d.includes('claude-code')), 'extension.js');
    const before = readFileSync(bundle);
    const r = runApply(lay.extensions);
    check('a second apply re-applies every patch', count(r.out, 'ok') >= 20, `${count(r.out, 'ok')} sites`);
    check('a second apply skips nothing', count(r.out, 'skip') === 0, `${count(r.out, 'skip')} skips`);
    check('a second apply lands on the same bytes', readFileSync(bundle).equals(before),
        `${before.length} -> ${readFileSync(bundle).length}`);
    check('a second apply reports no failure', count(r.out, 'fail') === 0);
    check('a second apply reaches Done and exits 0', /\nDone \(/.test(r.out) && r.code === 0, `exit ${r.code}`);
    check('a second apply misses no anchor', count(r.out, 'miss') === 0,
        (r.out.match(/\[miss\][^\n]*/g) || []).join(' | '));
}

/* worktree-banner, made to throw as its first statement. */
const withThrowingBanner = (body) => withBrokenPatch('worktree-banner/patch.ps1',
    (s) => s.replace(/(function Invoke-Patch \{\r?\n\s*param\(\$Ctx\))/, "$1\n    throw 'deliberate self-test failure'"), body);

/* A run that would leave the install with fewer working patches writes nothing
   (lib/Regression.ps1) - the run that took RTL off an install on 2026-10-09. Runs
   against the fully patched lab the idempotency check leaves behind. */
export function keepsInstall(check, lay) {
    const dir = readdirSync(lay.extensions).find((d) => d.includes('claude-code'));
    const files = ['extension.js', 'webview/index.js', 'webview/index.css'].map((f) => join(lay.extensions, dir, f));
    const before = files.map((f) => readFileSync(f));
    const r = withThrowingBanner(() => runApply(lay.extensions));
    if (r.skipped) return check('a run that drops a patch can be simulated', false, r.skipped);
    check('a run that would drop a working patch writes nothing', files.every((f, i) => readFileSync(f).equals(before[i])));
    check('it names the patch it would have dropped', /this run would have removed: worktree-banner/.test(r.out));
    check('and exits non-zero', r.code !== 0, `exit ${r.code}`);
}

/* A patch that throws used to end the run, and a run that stopped a third of the
   way through still had plenty of [ok] behind it.

   These two run against PRISTINE bundles. Against already-patched ones every patch
   answers [skip], and "did the rest still run" and "did a missing anchor leave the
   file alone" both become unanswerable - the first self-test run said 0 sites
   patched and read it as a failure. */
export async function throwingPatch(check, lay) {
    await vsix.restore(lay);
    const r = withThrowingBanner(() => runApply(lay.extensions));
    if (r.skipped) return check('a throwing patch can be simulated', false, r.skipped);
    check('the failure is reported as [fail]', /\[fail\] worktree-banner threw/.test(r.out));
    check('the failure names its editor', /\/ worktree-banner : deliberate self-test failure/.test(r.out));
    check('every later patch still ran', count(r.out, 'ok') >= 25, `${count(r.out, 'ok')} sites`);
    check('the run does not claim Done', !/\nDone \(/.test(r.out));
    check('the run exits non-zero', r.code !== 0, `exit ${r.code}`);
}

/* The project's core safety rule: a missing anchor leaves the file untouched. */
export async function missingAnchor(check, lay) {
    await vsix.restore(lay);
    const r = withBrokenPatch('cwd-drive-case/patch.ps1',
        (s) => s.replace("$rxSdk = '", "$rxSdk = 'NO_SUCH_ANCHOR_zzz"),
        () => runApply(lay.extensions));
    if (r.skipped) return check('a missing anchor can be simulated', false, r.skipped);
    /* up to whichever patch runs next, so a patch added to $order does not land in it */
    const from = r.out.indexOf('==> cwd-drive-case');
    const section = r.out.slice(from, r.out.indexOf('==> ', from + 4));
    check('the broken patch reports a miss, not an ok', /\[miss\]/.test(section) && !/\[ok\]/.test(section), section.trim().replace(/\s+/g, ' '));
    check('the run still finishes', /Done \(/.test(r.out));
    check('no patch threw', count(r.out, 'fail') === 0);

    const dir = readdirSync(lay.extensions).find((d) => d.includes('claude-code'));
    const js = readFileSync(join(lay.extensions, dir, 'extension.js'), 'utf8');
    check('nothing of the broken anchor was written', !js.includes('NO_SUCH_ANCHOR'));
    check('no half-written guard was left', !js.includes('/* CWDDRIVECASE */'));
    check('the other patches still landed', js.includes('/* AUTOFOLLOWUPHOST */') && js.includes('/* QUEUE */'));
}
