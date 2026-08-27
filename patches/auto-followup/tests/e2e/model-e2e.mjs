/* Does the model picked in the dialog decide which model answers?
 *
 *   node patches/auto-followup/tests/e2e/model-e2e.mjs [opus|sonnet|haiku]
 *
 * Nothing short of this can tell. The unit tests know the field is written; the
 * runner test knows an argv is built. Neither says the value a person picked in
 * the dropdown is the value the CLI was given, and none of them says the CLI
 * paid any attention to it.
 *
 * So: the real dialog is opened, the MODEL dropdown is opened and an option is
 * clicked, Save is pressed, every message the panel posts is carried to the real
 * host, and the run that follows is a real spawn. The answer comes from the CLI's
 * own envelope - each assistant event carries message.model.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const tests = join(here, '..'), patch = join(tests, '..');
const want = process.argv[2] || 'opus';
const realRequire = createRequire(import.meta.url);
const cp = realRequire('node:child_process');

const spawned = { argv: null, out: [] };
const wrappedCp = { ...cp, spawn(cmd, args, opts) {
  spawned.argv = [cmd, ...args];
  /* The store is isolated with CLAUDE_CONFIG_DIR, and run.js hands the child
     process.env - so without this the CLI inherits the sandbox, finds no
     credentials and answers in about a second with a synthetic message. It
     looked exactly like a model that ignored --model. The isolation is for the
     responder file; the CLI gets the real config. */
  const env = { ...(opts && opts.env ? opts.env : process.env) };
  if (realConfig === undefined) delete env.CLAUDE_CONFIG_DIR;
  else env.CLAUDE_CONFIG_DIR = realConfig;
  const child = cp.spawn(cmd, args, { ...opts, env });
  child.stdout.on('data', (d) => spawned.out.push(d.toString()));
  return child;
} };
globalThis.require = (id) => (id === 'child_process' || id === 'node:child_process')
  ? wrappedCp : realRequire(id);

/* The store writes real files under CLAUDE_CONFIG_DIR, and this test saves one.
   root() reads the variable on every call, so it is set for the store and taken
   away again before the CLI is spawned - the CLI needs the real config or it
   answers "Not logged in" and the run proves nothing. */
const sandbox = mkdtempSync(join(tmpdir(), 'af-model-'));
const realConfig = process.env.CLAUDE_CONFIG_DIR;
const inSandbox = (fn) => {
  process.env.CLAUDE_CONFIG_DIR = sandbox;
  try { return fn(); } finally {
    if (realConfig === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = realConfig;
  }
};

for (const f of ['format.js', 'store.js', 'samples.js', 'prompt.js', 'run.js', 'handle.js'])
  (0, eval)(readFileSync(join(patch, 'host', f), 'utf8'));
inSandbox(() => globalThis.__ccAfStore.seedIfEmpty(globalThis.__ccAfSamples));

const realInterval = setInterval, realClear = clearInterval, realTimeout = setTimeout;
realRequire(join(tests, 'dom-stubs.js'));
globalThis.setTimeout = realTimeout;      /* see e2e/README.md */

const T = realRequire(join(tests, 'load-panel.js')).loadPanel(
  '{arm:arm,maybeRun:maybeRun,openDialog:openDialog,selectDraft:selectDraft,' +
  'draft:function(){return draft;},state:()=>({slot:slot,pending:pending})}');

/* The bridge: whatever the panel posts goes to the host, and whatever the host
   posts comes back. Faking only this is the point of the exercise. */
const webview = { postMessage: (m) => globalThis.__onMsg({ data: m }) };
const pump = () => {
  const out = globalThis.sent.splice(0, globalThis.sent.length);
  for (const m of out) inSandbox(() => globalThis.__ccAf.handle(m, webview));
  return out;
};

const say = [];
const ok = (c, m) => { say.push((c ? '  ok   ' : '  FAIL ') + m); return c; };

pump();                                     /* the list the panel asked for on load */
T.openDialog(); pump();
T.selectDraft('perf-skeptic');
const before = T.draft().model;

const model = [...document.querySelectorAll('.__afF')]
  .find((f) => (f.getAttribute('aria-label') || '').indexOf('model') === 0);
if (!ok(!!model, 'the dialog has a model field')) { console.log(say.join('\n')); process.exit(1); }
model.click();
const option = [...document.querySelectorAll('.__afDrop .__afDItem')]
  .find((n) => n.textContent.trim().indexOf(want) === 0);
if (!ok(!!option, 'the dropdown offers ' + want)) { console.log(say.join('\n')); process.exit(1); }
option.click();
ok(T.draft().model === want, 'clicking it changes the draft from ' + before + ' to ' + want);

/* The footer buttons are .__afB, and the primary one reads "Saved" until there
   is something to save - so its label is also the check that the click was
   registered as an edit. */
const save = document.querySelector('.__afDlg .__afB.__afPri');
if (!ok(!!save, 'the dialog has a primary button')) { console.log(say.join(String.fromCharCode(10))); process.exit(1); }
ok(save.textContent.trim() === 'Save', 'it says Save rather than Saved, so the edit was noticed');
save.click();
const posted = pump();
ok(posted.some((m) => m.op === 'save' && m.responder && m.responder.model === want),
   'Save posts the responder with model ' + want);
ok(inSandbox(() => globalThis.__ccAfStore.read('perf-skeptic').model) === want,
   'and the file on disk says ' + want);

T.arm('perf-skeptic');
globalThis.__msgs = [{ role: 'user', content: 'go' }, { role: 'assistant', content:
  'The q6_K GEMM landed: 28.0 s to 21.8 s, +27%, output byte-identical.' }];
T.maybeRun();
const ask = globalThis.sent.find((m) => m.op === 'run');
if (!ok(!!ask, 'the panel asks for a run')) { console.log(say.join('\n')); process.exit(1); }
ask.ctx.cwd = tmpdir();
pump();

const t0 = Date.now();
await new Promise((res) => { const iv = realInterval(() => {
  if (spawned.argv && (Date.now() - t0 > 180000 || done())) { realClear(iv); res(); }
}, 200); });
function done() { return spawned.out.join('').indexOf('"type":"result"') >= 0; }

const models = new Set();
for (const line of spawned.out.join('').split(String.fromCharCode(10))) {
  const t = line.trim();
  if (!t || t.charAt(0) !== '{') continue;
  let o; try { o = JSON.parse(t); } catch (e) { continue; }
  const m = (o.message && o.message.model) || (o.event && o.event.message && o.event.message.model);
  if (m) models.add(m);
}
const family = want === 'haiku' ? 'haiku' : want;
ok(!!spawned.argv && spawned.argv.join(' ').indexOf('--model ' + want) >= 0,
   'the CLI is spawned with --model ' + want);
ok(models.size > 0, 'the CLI said which model it is');
ok([...models].every((m) => m.indexOf(family) >= 0),
   'and every assistant message came from ' + family + ': ' + [...models].join(', '));

console.log(say.join('\n'));
console.log('  argv: ' + (spawned.argv || []).join(' '));
console.log('  ' + (Date.now() - t0) + 'ms');
const bad = say.filter((l) => l.indexOf('FAIL') === 2).length;
console.log(bad ? '  ' + bad + ' failed' : '  all ' + say.length + ' passed');
process.exit(bad ? 1 : 0);
