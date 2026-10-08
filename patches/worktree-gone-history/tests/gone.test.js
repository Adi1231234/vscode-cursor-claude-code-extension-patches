/* Which worktree folders are handed back to the session lookups, against real
 * folders: a throwaway ~/.claude/projects (via CLAUDE_CONFIG_DIR) and a
 * throwaway repo.
 *
 *   node patches/worktree-gone-history/tests/gone.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-gone-'));
process.env.CLAUDE_CONFIG_DIR = path.join(tmp, 'config');
const projects = path.join(process.env.CLAUDE_CONFIG_DIR, 'projects');
const repo = path.join(tmp, 'My Repo');
const wt = (n) => path.join(repo, '.claude', 'worktrees', n);
const key = (p) => p.replace(/[^a-zA-Z0-9]/g, '-');
const folder = (p) => fs.mkdirSync(path.join(projects, key(p)), { recursive: true });

eval(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'lib', 'js', 'ccProjects.js'), 'utf8'));
eval(fs.readFileSync(path.resolve(__dirname, '..', 'host', 'gone.js'), 'utf8'));
const withGone = globalThis.__ccGoneWorktrees;

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };
const keys = (list) => list.map((p) => key(p).toLowerCase()).sort();

(async () => {
    folder(repo);
    folder(wt('live'));                       // still a worktree: git lists it
    fs.mkdirSync(wt('live'), { recursive: true });
    fs.writeFileSync(path.join(wt('live'), '.git'), 'gitdir: x');
    folder(wt('gone-one'));                   // deleted: only its projects folder is left
    folder(wt('gone-two'));
    fs.mkdirSync(path.join(projects, key(wt('also-live'))), { recursive: true });
    fs.mkdirSync(wt('also-live'), { recursive: true });   // unlisted by git, but a live checkout
    fs.writeFileSync(path.join(wt('also-live'), '.git'), 'gitdir: y');
    folder(path.join(tmp, 'Other Repo', '.claude', 'worktrees', 'x'));   // another repo's worktree

    const listed = [repo, wt('live')];
    const got = await withGone(listed, repo);
    ok(JSON.stringify(keys(got)) === JSON.stringify(keys([repo, wt('live'), wt('gone-one'), wt('gone-two')])),
        'the two deleted worktrees must be added, and nothing else: ' + keys(got).join(' '));
    ok(got[0] === repo && got[1] === wt('live'), "git's own answer must come first, unchanged");
    ok(listed.length === 2, "git's list must not be modified in place");

    // the folder names come back as keys the callers can match: same key, any drive-letter case
    const upper = await withGone([repo.charAt(0).toUpperCase() + repo.slice(1)], repo.charAt(0).toLowerCase() + repo.slice(1));
    ok(upper.length === 3, 'a differently cased root must still find its folders, got ' + upper.length);

    // nothing to add, or nothing readable: the list as it was
    ok((await withGone([wt('live')], path.join(tmp, 'Nowhere'))).length === 1, 'a repo with no folders adds nothing');
    process.env.CLAUDE_CONFIG_DIR = path.join(tmp, 'missing');
    ok((await withGone(listed, repo)) === listed, 'an unreadable projects folder must return the list untouched');
    ok((await withGone(undefined, repo)) === undefined && (await withGone([], 42)).length === 0, 'bad input must come back unchanged');

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log((fail ? 'FAILED' : 'ok') + ' - ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
