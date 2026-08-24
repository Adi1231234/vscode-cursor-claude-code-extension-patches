/* The checks that need nothing but the repo and a patched lab: does everything
   parse, did every patch land, and - the one a plain `node --check` cannot answer -
   does the injected script still parse after the template literal around it has
   been evaluated, which is what the browser actually runs. */

import { readFileSync, readdirSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO } from '../paths.mjs';

const parses = (file) => {
    try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); return null; }
    catch (e) { return String(e.stderr || e.message).split('\n')[0].slice(0, 160); }
};

/* Newlines, not split().length - a file ending in one would otherwise count a line
   longer than it is, and 150 is a limit a file is allowed to sit exactly on. This
   counts what `wc -l` and PowerShell's Measure-Object -Line count. */
const lines = (file) => (readFileSync(file, 'utf8').match(/\n/g) || []).length;

const walk = function* (dir, ext) {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, name.name);
        if (name.isDirectory()) yield* walk(p, ext);
        else if (name.name.endsWith(ext)) yield p;
    }
};

export function staticChecks(check) {
    const bad = [];
    for (const dir of ['tools/lab', 'tools/cdp']) {
        for (const f of walk(join(REPO, dir), '.mjs')) if (parses(f)) bad.push(`${f}: ${parses(f)}`);
    }
    check('every lab and cdp module parses', !bad.length, bad.join(' | '));

    /* The 150-line rule is for source, not for prose. */
    const big = [];
    for (const dir of ['tools/lab', 'tools/cdp', 'lib', 'patches']) {
        for (const ext of ['.mjs', '.js', '.ps1']) {
            for (const f of walk(join(REPO, dir), ext)) if (lines(f) > 150) big.push(`${f.slice(REPO.length + 1)}=${lines(f)}`);
        }
    }
    check('no source file over 150 lines', !big.length, big.join(', '));

}

/* Every guard the patches declare, checked against whichever bundle its patch
   writes to - read out of the sources so a new patch is covered without anyone
   remembering to add it here. */
export function bundleChecks(check, lay) {
    const extRoot = lay.extensions;
    const dir = existsSync(extRoot) && readdirSync(extRoot).find((d) => d.includes('claude-code'));
    if (!dir) return check('the lab has a patched extension', false, `nothing under ${extRoot}`);
    const ext = join(extRoot, dir);
    const js = join(ext, 'extension.js');
    const web = join(ext, 'webview', 'index.js');

    check('patched extension.js parses', !parses(js), parses(js) || '');
    check('patched webview/index.js parses', !parses(web), parses(web) || '');

    const bundles = [readFileSync(js, 'utf8'), readFileSync(web, 'utf8'),
        readFileSync(join(ext, 'webview', 'index.css'), 'utf8')];
    const guards = [...new Set(readdirSync(join(REPO, 'patches')).flatMap((name) => {
        const f = join(REPO, 'patches', name, 'patch.ps1');
        return existsSync(f) ? [...readFileSync(f, 'utf8').matchAll(/'(\/\* [A-Z0-9 _-]+ \*\/)'/g)].map((m) => m[1]) : [];
    }))];
    const missing = guards.filter((g) => !bundles.some((b) => b.includes(g)));
    check(`all ${guards.length} patch guards landed`, !missing.length, missing.join(', '));

    evaluatedScript(check, readFileSync(js, 'utf8'));
}

/* The hazard the conventions describe: a webview script injected into extension.js
   lands INSIDE a template literal, so a backtick or ${ breaks out of it, and every
   escape is evaluated before the browser sees the script - a \n inside a string
   becomes a real newline and breaks it. `node --check extension.js` passes on the
   two-character \n and sees none of that.

   So every injected <script> is pulled out, evaluated as the literal it lives in,
   and checked in that form, which is what the browser actually runs. Scanning the
   .js sources for backticks instead would flag host code and prose in comments that
   never go near a template literal, and would miss anything assembled at patch
   time. */
function evaluatedScript(check, d) {
    const blocks = [...d.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
        .filter((m) => /\/\* [A-Z0-9]+ \*\//.test(m[1]));
    check('the patched bundle carries injected scripts', blocks.length > 0);

    for (const m of blocks) {
        const guard = (m[1].match(/\/\* [A-Z0-9]+ \*\//) || ['?'])[0];
        let evaluated;
        try { evaluated = new Function('nonce', 'u', 'return `' + m[1] + '`')('NONCE', 'NONCE'); }
        catch (e) { check(`${guard} survives its template literal`, false, e.message); continue; }
        const out = join(process.env.TEMP, `_cclab-eval-${process.pid}.js`);
        writeFileSync(out, evaluated);
        const err = parses(out);
        rmSync(out, { force: true });
        check(`${guard} parses as the browser runs it (${evaluated.split('\n').length} lines)`, !err, err || '');
    }
}
