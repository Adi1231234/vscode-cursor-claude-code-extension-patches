/* The worktree list read from disk must be exactly what `git worktree list
 * --porcelain` prints, from every place a lookup can start: a throwaway repo
 * with real worktrees (one with `_` in its name, one outside the repo, one whose
 * folder was deleted), asked from the main checkout, a worktree and a subfolder.
 *
 *   node patches/worktree-list-fallback/tests/on-disk.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

eval(fs.readFileSync(path.resolve(__dirname, '..', 'host', 'on-disk.js'), 'utf8'));
const onDisk = globalThis.__ccWorktreesOnDisk;

const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-wtlist-')));
const repo = path.join(tmp, 'My Repo');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
// What the lister makes of git's answer, [] when git fails (its catch).
const fromGit = (cwd) => {
    try {
        return git(cwd, 'worktree', 'list', '--porcelain')
            .split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9));
    } catch (e) {
        return [];
    }
};

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };
const same = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n    disk: ' + JSON.stringify(a) + '\n    git:  ' + JSON.stringify(b));
const quiet = console.warn;

(async () => {
    console.warn = () => {};
    fs.mkdirSync(path.join(repo, 'src', 'deep'), { recursive: true });
    git(repo, 'init', '-q');
    git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x');
    git(repo, 'worktree', 'add', '-q', '-b', 'a', path.join(repo, '.claude', 'worktrees', 'gen9-q4_0'));
    git(repo, 'worktree', 'add', '-q', '-b', 'b', path.join(repo, '.claude', 'worktrees', 'zeta'));
    git(repo, 'worktree', 'add', '-q', '-b', 'c', path.join(tmp, 'Outside Tree'));
    git(repo, 'worktree', 'add', '-q', '-b', 'd', path.join(repo, '.claude', 'worktrees', 'deleted'));
    fs.rmSync(path.join(repo, '.claude', 'worktrees', 'deleted'), { recursive: true, force: true });

    const id = (p) => p;
    for (const cwd of [repo, path.join(repo, 'src', 'deep'), path.join(repo, '.claude', 'worktrees', 'gen9-q4_0')]) {
        same(await onDisk(cwd, id), fromGit(cwd), 'from ' + path.relative(tmp, cwd));
    }

    const mapped = await onDisk(repo, (p) => 'M:' + p);
    ok(mapped.length === 5 && mapped.every((p) => p.startsWith('M:')), "every path goes through the lister's mapper");

    let line = '';
    console.warn = (s) => { line = s; };
    await onDisk(repo, id, Object.assign(new Error('x'), { killed: true }));
    ok(/timed out/.test(line) && /read 5 worktree/.test(line), 'the decision is logged: ' + line);

    const outside = path.join(tmp, 'not a repo');
    fs.mkdirSync(outside);
    same(await onDisk(outside, id), fromGit(outside), 'a folder outside any repository gives what git gives');
    console.warn = quiet;

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log((fail ? 'FAILED' : 'ok') + ' - ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.warn = quiet; console.error(e); process.exit(1); });
