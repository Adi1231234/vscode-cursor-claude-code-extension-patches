/* Driving one lab from a test, and reading back what it did: its commands, a
 * real turn, its session files and its extension log. live.mjs is the user. */
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, rmSync, watch } from 'node:fs';
import { join } from 'node:path';

export function connect({ port, labJs, here }) {
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

  const dir = json(lab('width')).dir;
  const proj = join(dir, 'proj');
  const projects = join(dir, 'home', '.claude', 'projects');
  const files = (root, pick) => readdirSync(root, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(root, e.name), pick) : pick(e.name) ? [join(root, e.name)] : []);
  const where = (id) => readdirSync(projects).find((d) => existsSync(join(projects, d, id + '.jsonl'))) || null;
  const landed = (text) => files(projects, (n) => n.endsWith('.jsonl'))
    .some((f) => readFileSync(f, 'utf8').includes(JSON.stringify(text).slice(1, 80)));
  const logs = join(dir, 'portable', 'user-data', 'logs');
  const logLines = () => files(logs, (n) => n === 'Claude VSCode.log').flatMap((f) => readFileSync(f, 'utf8').split(/\r?\n/));
  const launches = (id) => logLines().filter((x) => x.includes('Spawning Claude with SDK') && x.includes('resume: ' + id));

  /* One real turn. A permission prompt (EnterWorktree by path asks for one) is
     answered "1", as a person at the panel would, and the wait goes on. Typed
     while the panel is still restoring after a reload, a prompt can be dropped
     without a trace; a short run can also end before the wait begins, so "never
     busy" alone proves nothing - resend only if no transcript holds it. */
  const turn = (text) => {
    lab('prompt', text);
    let r = evalFile('idle.js');
    if (r === 'never-busy' && !landed(text)) { lab('prompt', text); r = evalFile('idle.js'); }
    for (let i = 0; r === 'permission' && i < 6; i++) { lab('press', '1'); r = evalFile('idle.js'); }
    return r;
  };

  /* The reload returns before the panel has relaunched its session, so wait for the
     next launch line of that session - on the log's own change events. A reload
     writes into a log folder created after the watch began, and once in a while
     that change is never reported: read once more before giving up. */
  const nextLaunch = (id, before) => new Promise((resolve) => {
    const cwdOf = (l) => l.replace(/^.* - cwd: /, '').replace(/, permission mode:.*$/, '');
    const look = () => {
      const all = launches(id);
      if (all.length > before) { w.close(); clearTimeout(t); resolve(cwdOf(all.pop())); }
    };
    const w = watch(logs, { recursive: true }, look);
    const t = setTimeout(() => { w.close(); const all = launches(id); resolve(all.length > before ? cwdOf(all.pop()) : null); }, 180000);
    look();
  });

  /* The tool results of one session, newest last, as plain text. */
  const results = (id) => readFileSync(join(projects, where(id), id + '.jsonl'), 'utf8').split('\n')
    .flatMap((l) => { try { const c = JSON.parse(l).message?.content; return Array.isArray(c) ? c : []; } catch { return []; } })
    .filter((b) => b.type === 'tool_result').map((b) => typeof b.content === 'string' ? b.content : JSON.stringify(b.content));

  /* Delete a worktree the way the lost sessions did: by hand, entry by entry, so
     one entry Windows will not let go of (the folder itself is the working
     directory of a live session) does not stop the rest; then git forgets it. */
  const removeWorktree = (wt) => {
    try { git(proj, 'worktree', 'unlock', wt); } catch {}
    for (const e of existsSync(wt) ? readdirSync(wt) : []) {
      try { rmSync(join(wt, e), { recursive: true, force: true }); } catch {}
    }
    try { rmSync(wt, { recursive: true, force: true }); } catch {}
    git(proj, 'worktree', 'prune');
    return !existsSync(join(wt, '.git'));
  };

  return { lab, evalFile, git, turn, dir, proj, projects, files, where, logLines, launches, nextLaunch, results, removeWorktree };
}
