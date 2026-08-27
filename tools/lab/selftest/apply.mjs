/* What apply.ps1 does when things go wrong, which is the part nobody exercises by
   hand: a second run must change nothing, a patch that throws must not pass for a
   patched install, and a missing anchor must leave the bundle untouched.

   Each of these deliberately breaks something in the repo and puts it straight
   back, so the working tree is the same afterwards - `git status` is part of the
   assertion, not an afterthought. */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO } from '../paths.mjs';
import * as vsix from '../vsix.mjs';

/* apply.ps1 writes with Write-Host, which does not go through the PowerShell
   pipeline - only a child process's stdout has it. */
function runApply(extensions) {
    try {
        return { out: execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-File', join(REPO, 'apply.ps1'), '-ExtensionsDir', extensions], { encoding: 'utf8', cwd: REPO }), code: 0 };
    } catch (e) {
        return { out: String(e.stdout || '') + String(e.stderr || ''), code: e.status };
    }
}

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

/* A patch that throws used to end the run, and a run that stopped a third of the
   way through still had plenty of [ok] behind it.

   These two run against PRISTINE bundles. Against already-patched ones every patch
   answers [skip], and "did the rest still run" and "did a missing anchor leave the
   file alone" both become unanswerable - the first self-test run said 0 sites
   patched and read it as a failure. */
export async function throwingPatch(check, lay) {
    await vsix.restore(lay);
    const r = withBrokenPatch('worktree-banner/patch.ps1',
        (s) => s.replace(/(function Invoke-Patch \{\r?\n\s*param\(\$Ctx\))/, "$1\n    throw 'deliberate self-test failure'"),
        () => runApply(lay.extensions));
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
        (s) => s.replace("$rx = 'cwd:", "$rx = 'NO_SUCH_ANCHOR_zzz_cwd:"),
        () => runApply(lay.extensions));
    if (r.skipped) return check('a missing anchor can be simulated', false, r.skipped);
    const section = r.out.slice(r.out.indexOf('==> cwd-drive-case'), r.out.indexOf('==> reload-restore'));
    check('the broken patch reports a miss, not an ok', /\[miss\]/.test(section) && !/\[ok\]/.test(section), section.trim().replace(/\s+/g, ' '));
    check('the run still finishes', /Done \(/.test(r.out));
    check('no patch threw', count(r.out, 'fail') === 0);

    const dir = readdirSync(lay.extensions).find((d) => d.includes('claude-code'));
    const js = readFileSync(join(lay.extensions, dir, 'extension.js'), 'utf8');
    check('nothing of the broken anchor was written', !js.includes('NO_SUCH_ANCHOR'));
    check('no half-written guard was left', !js.includes('/* CWDDRIVECASE */'));
    check('the other patches still landed', js.includes('/* BGTASKS */') && js.includes('/* QUEUE */'));
}
