/* Which folder a resumed session is launched in, against real files.
 *
 * Every case builds a throwaway ~/.claude/projects (via CLAUDE_CONFIG_DIR) and
 * a throwaway repo with a .claude/worktrees/<name> folder, writes a transcript
 * shaped like the CLI's, and asks the host runtime directly.
 *
 *   node patches/worktree-resume-origin/tests/origin.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-resume-origin-'));
process.env.CLAUDE_CONFIG_DIR = path.join(tmp, 'config');
const repo = path.join(tmp, 'repo');
const wt = path.join(repo, '.claude', 'worktrees', 'feature');
fs.mkdirSync(wt, { recursive: true });

const host = (f) => path.resolve(__dirname, '..', 'host', f);
eval(fs.readFileSync(host('transcript.js'), 'utf8'));
eval(fs.readFileSync(host('origin.js'), 'utf8'));
const pick = globalThis.__ccResumeOrigin;

const logged = [];
const logger = { log: (t) => logged.push(t) };
const line = (o) => JSON.stringify(o) + '\n';
const state = (ws) => line({ type: 'worktree-state', worktreeSession: ws, sessionId: 'x' });
const entered = (from) => ({ originalCwd: from, preEnterOriginalCwd: from, worktreePath: wt,
                             worktreeName: 'feature', enteredExisting: true });
const chatter = (n) => Array.from({ length: n }, (_, i) =>
    line({ type: 'user', cwd: wt, message: { content: 'שלום ' + i + ' '.repeat(i % 7) } })).join('');

let seq = 0;
function transcript(body, folder = 'C--repo--claude-worktrees-feature') {
    const id = 'sess-' + (++seq);
    const dir = path.join(process.env.CLAUDE_CONFIG_DIR, 'projects', folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, id + '.jsonl'), body);
    return id;
}

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };

(async () => {
    // 1. the bug itself: entered the worktree with EnterWorktree -> launch from where it came from
    let id = transcript(chatter(5) + state(entered(repo)) + chatter(3));
    ok(await pick(id, wt, logger) === repo, 'an entered worktree must launch from its origin');

    // 2. started inside the worktree: no record, keep the panel's choice
    id = transcript(chatter(8));
    ok(await pick(id, wt, logger) === wt, 'a session born in the worktree must launch there');

    // 3. exited (newest record null): the last non-null one still names the origin
    id = transcript(state(entered(repo)) + chatter(4) + state(null) + chatter(2));
    ok(await pick(id, wt, logger) === repo, 'an exited session must launch from its origin');

    // 4. only null records: fall back to the repo the worktree belongs to
    id = transcript(chatter(2) + state(null));
    ok(await pick(id, wt + path.sep, logger) === repo, 'a null-only record must fall back to the repo root');

    // 5. the origin it recorded is gone: keep the panel's choice
    id = transcript(state(entered(path.join(tmp, 'deleted'))));
    ok(await pick(id, wt, logger) === wt, 'a missing origin must not be launched in');

    // 6. no transcript anywhere, and a cwd that is not a worktree at all
    ok(await pick('no-such-session', wt, logger) === wt, 'an unknown session must keep its cwd');
    ok(await pick('anything', repo, logger) === repo, 'a non-worktree cwd must be untouched');

    // 7. the record far from the end, Hebrew and long lines across chunk borders,
    //    plus one line longer than a whole chunk right after it
    const huge = line({ type: 'user', message: { content: 'א'.repeat(300 * 1024) } });
    id = transcript(chatter(50) + state(entered(repo)) + huge + chatter(4000), 'C--elsewhere');
    ok(await pick(id, wt, logger) === repo, 'a record megabytes from the end must still be found');

    // 8. never throws, whatever it is handed
    ok(await pick(undefined, wt) === wt && await pick('x', undefined) === undefined,
       'bad input must come back unchanged');
    ok(logged.some((t) => t.includes('entered ' + wt + ' itself')), 'the decision must be logged');

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log((fail ? 'FAILED' : 'ok') + ' - ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
