/* The extension's own worktree lister, run out of a real extension.js with git
 * that never answers in time - the way it ran when an editor started with many
 * panels. Unpatched it returns [] after its timeout (the session is "not
 * found"); patched it must return exactly what git prints.
 *
 *   node patches/worktree-list-fallback/tests/bundle.test.js <extension.js> [repo]
 *
 * Exit 0 when the bundle is patched and answers like git, 1 otherwise, so it
 * also proves the unpatched bundle fails (expect 1 on extension.js.pristine).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const cp = require('child_process');
const Module = require('module');

const [bundle, repo = process.cwd()] = process.argv.slice(2);
const real = fs.readFileSync(bundle, 'utf8');
// The listers the session lookups call: they put every path through a mapper.
// The security check that a path is a registered worktree (`git -C <path>`,
// `.slice(9).trim()`) keeps git's answer as is and is not one of them.
const lister = /async function ([\w$]+)\([\w$]+\)\{(?:(?!function )[\s\S]){0,400}?"worktree","list","--porcelain"(?:(?!function )[\s\S]){0,400}?\.map\(\(([\w$]+)\)=>[\w$]+\(\2\.slice\(9\)\)\)/g;
const names = [...real.matchAll(lister)].map((m) => m[1]);
if (!names.length) { console.log('no git worktree lister in ' + bundle); process.exit(1); }

// git that does not answer in time: the call fails the way execFile fails on
// its timeout. Every other command runs for real.
const realExecFile = cp.execFile;
const realAsync = realExecFile[util.promisify.custom];
const execFile = function (...a) { return realExecFile.apply(this, a); };
execFile[util.promisify.custom] = function (file, args, opts) {
    if (!(Array.isArray(args) && args.includes('worktree'))) return realAsync.call(this, file, args, opts);
    const err = Object.assign(new Error('Command failed: git worktree list'), { killed: true, signal: 'SIGTERM' });
    return new Promise((_, reject) => setTimeout(() => reject(err), 50));
};
cp.execFile = execFile;

// The bundle needs `vscode`; nothing on this path uses it.
const anything = () => new Proxy(function () {}, { get: () => anything(), apply: () => anything(), construct: () => anything() });
const load = Module._load;
Module._load = function (request, ...rest) {
    return request === 'vscode' ? Object.create(anything()) : load.call(this, request, ...rest);
};

const copy = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-wtlist-bundle-')), 'extension.cjs');
fs.writeFileSync(copy, real + '\n;module.exports.__ccListers=[' + names.join(',') + '];\n');
const listers = require(copy).__ccListers;

const git = cp.execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: repo, encoding: 'utf8' })
    .split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9));

(async () => {
    let fail = 0;
    const warn = console.warn;
    for (let i = 0; i < listers.length; i++) {
        let logged = '';
        console.warn = (s) => { logged = String(s); };
        const got = await listers[i](repo);
        console.warn = warn;
        const same = JSON.stringify(got) === JSON.stringify(git);
        if (!same) fail++;
        console.log((same ? 'ok  ' : 'FAIL') + ' ' + names[i] + ': ' + got.length + ' of ' + git.length + ' worktrees with git timed out');
        if (logged) console.log('     log: ' + logged);
    }
    fs.rmSync(path.dirname(copy), { recursive: true, force: true });
    process.exit(fail ? 1 : 0);
})();
