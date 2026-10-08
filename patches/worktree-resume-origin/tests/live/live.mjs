/* The whole story in a real editor, one real turn per step: a panel session
 * enters a worktree, the window reloads with it inside, the session leaves the
 * worktree, the worktree is deleted, the window reloads again.
 *
 *   node tools/lab/lab.mjs up --port 9583
 *   node patches/worktree-resume-origin/tests/live/live.mjs --port 9583 [--exit remove] [--lab <other checkout>/tools/lab/lab.mjs]
 *
 * --lab drives a lab built from another checkout, which is how the same steps are
 * run against a bundle without this patch: there the checks are expected to fail.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, rmSync, existsSync, watch } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const port = arg('--port', '9583');
const labJs = arg('--lab', join(here, '..', '..', '..', '..', 'tools', 'lab', 'lab.mjs'));
const NAME = 'live-wt-' + Date.now().toString(36);
const EXIT = arg('--exit', 'keep');   // or "remove": the session deletes its own worktree

const lab = (...a) => {
  const r = spawnSync(process.execPath, [labJs, ...a, '--port', port], { encoding: 'utf8', timeout: 900000 });
  return (r.stdout || '') + (r.stderr || '');
};
/* The lab's own "[lab] ..." lines open with a bracket too, so drop them first. */
const json = (out) => {
  const m = out.split('\n').filter((l) => !l.startsWith('[lab]')).join('\n').match(/[[{][\s\S]*[\]}]/);
  try { return m && JSON.parse(m[0]); } catch { return null; }
};
const evalFile = (f) => json(lab('eval', join(here, f)));
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
/* One real turn. A permission prompt (EnterWorktree by path asks for one) is
   answered "1", as a person at the panel would, and the wait goes on. */
const turn = (text) => {
  lab('prompt', text);
  let r = evalFile('idle.js');
  /* Typed while the panel was still restoring after a reload, a prompt can be
     dropped without a trace. A short run can also end before the wait begins,
     so "never busy" alone proves nothing: resend only if no transcript holds it. */
  if (r === 'never-busy' && !landed(text)) { lab('prompt', text); r = evalFile('idle.js'); }
  for (let i = 0; r === 'permission' && i < 6; i++) { lab('press', '1'); r = evalFile('idle.js'); }
  return r;
};

const dir = json(lab('width')).dir;
const proj = join(dir, 'proj');
const projects = join(dir, 'home', '.claude', 'projects');
const projKey = proj.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

const landed = (text) => files(projects, (n) => n.endsWith('.jsonl'))
  .some((f) => readFileSync(f, 'utf8').includes(JSON.stringify(text).slice(1, 80)));
const files = (root, pick) => readdirSync(root, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? files(join(root, e.name), pick) : pick(e.name) ? [join(root, e.name)] : []);
const where = (id) => readdirSync(projects).find((d) => existsSync(join(projects, d, id + '.jsonl'))) || null;
const logLines = () => files(join(dir, 'portable', 'user-data', 'logs'), (n) => n === 'Claude VSCode.log')
  .flatMap((f) => readFileSync(f, 'utf8').split(/\r?\n/));
const launches = (id) => logLines().filter((x) => x.includes('Spawning Claude with SDK') && x.includes('resume: ' + id));
/* The reload returns before the panel has relaunched its session, so wait for the
   next launch line of that session to be written - on the log's own change events. */
const nextLaunch = (id, before) => new Promise((resolve) => {
  const look = () => {
    const all = launches(id);
    if (all.length > before) { w.close(); clearTimeout(t); resolve(all.pop().replace(/^.* - cwd: /, '').replace(/, permission mode:.*$/, '')); }
  };
  const w = watch(join(dir, 'portable', 'user-data', 'logs'), { recursive: true }, look);
  const t = setTimeout(() => { w.close(); resolve(null); }, 120000);
  look();
});
/* The tool results of one session, newest last, as plain text. */
const results = (id) => readFileSync(join(projects, where(id), id + '.jsonl'), 'utf8').split('\n')
  .flatMap((l) => { try { const c = JSON.parse(l).message?.content; return Array.isArray(c) ? c : []; } catch { return []; } })
  .filter((b) => b.type === 'tool_result').map((b) => typeof b.content === 'string' ? b.content : JSON.stringify(b.content));

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

/* 4. the worktree goes: by hand, the way the sessions did after "keep", or by
   ExitWorktree itself after "remove" - then reload */
const wt = join(proj, '.claude', 'worktrees', NAME);
if (EXIT === 'keep') {
  try { git(proj, 'worktree', 'unlock', wt); } catch {}
  try { rmSync(wt, { recursive: true, force: true }); } catch {}
  git(proj, 'worktree', 'prune');
} else {
  ok(!git(proj, 'worktree', 'list').includes(NAME), 'ExitWorktree remove deleted the worktree');
}
lab('repatch');
const list = evalFile('sessions.js') || [];
ok(Array.isArray(list) && list.some((s) => s.id === id), 'after deleting the worktree the session is still in the history list');

console.log(`session ${id}, worktree ${NAME}\n` + say.join('\n'));
process.exit(say.some((l) => l.includes('FAIL')) ? 1 : 0);
