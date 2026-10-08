/* The whole story in a real editor, one real turn per step: a panel session
 * enters a worktree, the window reloads with it inside, the session leaves the
 * worktree, the worktree is deleted, the window reloads again.
 *
 *   node tools/lab/lab.mjs up --port 9583
 *   node patches/worktree-resume-origin/tests/live/live.mjs --port 9583 [--exit keep|remove|none] [--lab <other checkout>/tools/lab/lab.mjs]
 *
 * --exit none deletes the worktree with the session still inside it, which is
 * what patches/worktree-gone-history covers.
 *
 * --lab drives a lab built from another checkout, which is how the same steps are
 * run against a bundle without this patch: there the checks are expected to fail.
 */
import { statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './lab-io.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const NAME = 'live-wt-' + Date.now().toString(36);
const EXIT = arg('--exit', 'keep');   // "remove": the session deletes its own worktree; "none": it never leaves
const { lab, evalFile, git, turn, proj, projects, files, where, logLines, launches, nextLaunch, results, removeWorktree } = connect({
  port: arg('--port', '9583'), here,
  labJs: arg('--lab', join(here, '..', '..', '..', '..', 'tools', 'lab', 'lab.mjs')),
});
const projKey = proj.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
const say = [];
const ok = (c, m) => { say.push((c ? '  ok   ' : '  FAIL ') + m); return c; };

/* 0. the folder is a repo before the session's CLI starts, and the run starts fresh */
if (!existsSync(join(proj, '.git'))) {
  git(proj, 'init', '-q'); git(proj, 'add', '-A');
  git(proj, '-c', 'user.name=lab', '-c', 'user.email=lab@lab', 'commit', '-qm', 'init');
  lab('repatch');
}
evalFile('new-session.js');

/* 1. enter */
/* Without cwd-drive-case the by-name call refuses (c:\ vs C:/), and the real
   sessions then entered by path - so the prompt allows exactly that fallback. */
/* The CLI sometimes fails a first worktree call with "Could not read the
   repository git config"; one more try by name gets past it. */
turn(`[${NAME}] Experiment step, do exactly this and nothing else: load EnterWorktree with ToolSearch, call EnterWorktree with name ${NAME}; if that fails, call it once more with the same name; only if that fails too, call EnterWorktree with path set to the folder .claude\\worktrees\\${NAME} inside the current directory, written with an uppercase C: drive. Then run the Bash command pwd.`);
const id = files(projects, (n) => n.endsWith('.jsonl'))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0].replace(/^.*[\\/]/, '').replace('.jsonl', '');
ok((where(id) || '').toLowerCase().endsWith('--claude-worktrees-' + NAME), `entering moved the transcript into the worktree's folder (${where(id)})`);

/* 2. reload with the session inside the worktree */
const seen = launches(id).length;
lab('repatch');
const relaunch = (await nextLaunch(id, seen)) || '';
ok(relaunch.toLowerCase() === proj.toLowerCase(), `the reload relaunched it from the project folder (${relaunch})`);

/* 3. leave, then two commands: the second is where an anchored session is pulled back */
async function leave() {
  const anchorBefore = logLines().filter((l) => l.includes('not moving the permission anchor')).length;
  turn(`[${NAME}] Experiment step, do exactly this and nothing else: load ExitWorktree with ToolSearch, call ExitWorktree with action ${EXIT}, then run the Bash command pwd, then run the Bash command pwd again.`);
  const [exitText, pwd1, pwd2] = results(id).slice(-3);
  ok(/Session is now back in/.test(exitText || ''), 'ExitWorktree answered that the session is back');
  ok((where(id) || '').toLowerCase() === projKey, `leaving brought the transcript home (${where(id)})`);
  /* Bash spells the folder its own way (the temp dir comes back as /tmp), so
     compare the last segment: the project folder is "proj", a worktree is not. */
  ok([pwd1, pwd2].every((p) => /\/proj$/.test((p || '').trim())),
    `both commands ran in the project folder (${[pwd1, pwd2].map((p) => (p || '').trim()).join(' | ')})`);
  /* Only readable when the CLI's debug lines reach the extension log at all. */
  const debug = logLines().some((l) => l.includes('[DEBUG]'));
  ok(logLines().filter((l) => l.includes('not moving the permission anchor')).length === anchorBefore,
    `the CLI did not refuse to move the anchor (its debug log ${debug ? 'is' : 'is NOT'} captured here)`);
}
/* "none" skips it: the worktree is deleted with the session still inside. */
if (EXIT !== 'none') await leave();

/* 4. the worktree goes: by hand (after "keep", or with the session inside), or by
   ExitWorktree itself after "remove" - then reload */
const wt = join(proj, '.claude', 'worktrees', NAME);
if (EXIT !== 'remove') {
  ok(removeWorktree(wt), 'the worktree was deleted (git no longer has it)');
} else {
  ok(!git(proj, 'worktree', 'list').includes(NAME), 'ExitWorktree remove deleted the worktree');
}
const before = launches(id).length;
lab('repatch');
const list = evalFile('sessions.js') || [];
ok(Array.isArray(list) && list.some((s) => s.id === id), 'after deleting the worktree the session is still in the history list');

/* 5. with its worktree gone under it, the session is restored and carries on */
if (EXIT === 'none') {
  const back = (await nextLaunch(id, before)) || '';
  ok(back.toLowerCase() === proj.toLowerCase(), `it was relaunched from the project folder (${back})`);
  turn(`[${NAME}] Experiment step, do exactly this and nothing else: run the Bash command pwd.`);
  const last = (results(id).pop() || '').trim();
  ok(/\/proj$/.test(last), `and it carries on there (${last})`);
}

console.log(`session ${id}, worktree ${NAME}\n` + say.join('\n'));
process.exit(say.some((l) => l.includes('FAIL')) ? 1 : 0);
