/* Edit a setting while the loop is armed, press Save, and does the next run use
 * it - every setting, not only the model.
 *
 *   node patches/auto-followup/tests/e2e/settings-live.mjs
 *
 * Real panel, real host, real dialog. The CLI is the one thing replaced: a fake
 * child records the argv and the prompt written to its stdin and answers with a
 * canned envelope. What is under test is whether an edit reaches the next run,
 * and the argv and the prompt are exactly where that is decided - model-e2e.mjs
 * is what proves the CLI then honours them.
 */
import { readFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';

const here = dirname(fileURLToPath(import.meta.url));
const tests = join(here, '..'), patch = join(tests, '..');
const realRequire = createRequire(import.meta.url);

const runs = [];
function fakeChild(args) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const rec = { argv: args, prompt: '' };
  runs.push(rec);
  child.kill = function () {};
  child.stdin = { end: function (t) {
    rec.prompt = String(t || '');
    const answer = JSON.stringify({ message: 'and how many inputs was that on?',
      why: 'a sameness claim with no count', claims: [], stop: false });
    /* The envelope has to be the real shape: unwrap() calls anything without
       subtype "success" a CLI error, and an error disarms the responder - so a
       lazy fake ends the loop after the first turn and every later check reads
       as the edit not taking effect. */
    child.stdout.emit('data', JSON.stringify({ type: 'result', subtype: 'success',
      is_error: false, result: answer }) + String.fromCharCode(10));
    child.emit('close', 0);
  } };
  return child;
}
globalThis.require = (id) => (id === 'child_process' || id === 'node:child_process')
  ? { spawn: (cmd, args) => fakeChild(args) } : realRequire(id);

process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'af-live-'));
for (const f of ['format.js', 'store.js', 'samples.js', 'prompt.js', 'run.js', 'handle.js'])
  (0, eval)(readFileSync(join(patch, 'host', f), 'utf8'));
globalThis.__ccAfStore.seedIfEmpty(globalThis.__ccAfSamples);

realRequire(join(tests, 'dom-stubs.js'));

const T = realRequire(join(tests, 'load-panel.js')).loadPanel(
  '{arm:arm,maybeRun:maybeRun,maybeSend:maybeSend,approve:approve,openDialog:openDialog,'
  + 'selectDraft:selectDraft,draft:function(){return draft;},'
  + 'btn:function(){return globalThis.__form.__afSlot;},'
  + 'state:()=>({armed:armed,turns:turns,slot:slot,pending:pending,stopped:stopped,meta:meta})}');

const wv = { postMessage: (m) => globalThis.__onMsg({ data: m }) };
const pump = () => {
  const out = globalThis.sent.splice(0);
  for (const m of out) globalThis.__ccAf.handle(m, wv);
  return out;
};

const say = [];
const ok = (c, m) => { say.push((c ? '  ok   ' : '  FAIL ') + m); return c; };

/* ---- the dialog, driven the way a person drives it ---- */
function edit(fn) {
  T.openDialog(); pump();
  T.selectDraft('perf-skeptic');
  fn();
  document.querySelector('.__afDlg .__afB.__afPri').click();
  pump();
  const ov = document.querySelector('.__afOverlay');
  if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
}
function pick(label, value) {
  const f = [...document.querySelectorAll('.__afF')]
    .find((n) => (n.getAttribute('aria-label') || '').indexOf(label + ':') === 0);
  if (!f) throw new Error('no field ' + label);
  f.click();
  const opt = [...document.querySelectorAll('.__afDrop .__afDItem')]
    .find((n) => n.textContent.trim().indexOf(value) === 0);
  if (!opt) throw new Error('no option ' + value + ' for ' + label);
  opt.click();
}
function type(headText, value) {
  const box = [...document.querySelectorAll('.__afDlg .__afBox')]
    .find((b) => ((b.querySelector('.__afBoxHead') || {}).textContent || '')
      .toLowerCase().indexOf(headText.toLowerCase()) === 0);
  if (!box) throw new Error('no box ' + headText);
  const ta = box.querySelector('.__afTa');
  ta.value = value;
  (ta.listeners.input || []).forEach((f) => f({}));
}

/* ---- armed first, edited after ---- */
pump();
/* One real pass before anything else, the way loop.test.js does it: the first
   tick is where the session id is read, and a first tick taken late looks like
   the session changing and resets the counter under you. */
globalThis.__tick();
T.arm('perf-skeptic');
ok(T.state().meta.model === 'sonnet', 'armed while it says sonnet');

let turn = 0;
function newReply() {
  turn += 1;
  globalThis.__msgs = [{ role: 'user', content: 'go' },
    { role: 'assistant', content: 'Run ' + turn + ': 28.0 s to 21.8 s, byte-identical.' }];
}
function nextRun() {
  newReply();
  runs.length = 0;
  T.maybeRun();
  const ask = globalThis.sent.find((m) => m.op === 'run');
  pump();
  if (T.state().slot) { T.approve(); T.maybeSend(); pump(); }
  return { spawn: runs[0], ask: ask };
}

/* One turn before anything is edited. The responder's '## once' question fires
   on the first turn whose pattern matches, and compose() gives that turn exactly
   one job - the rules are deliberately not in that prompt. Checking a rules edit
   against it reads as the edit being ignored when it is the once gate doing its
   job. */
const warm = nextRun();
ok((warm.spawn.prompt || '').indexOf('exactly one job') > 0,
   'the once question fires on the first matching turn, before any edit');

edit(() => pick('model', 'opus'));
ok((nextRun().spawn || {}).argv.join(' ').indexOf('--model opus') >= 0,
   'model: the next run is spawned with --model opus');

edit(() => pick('effort', 'xhigh'));
ok((nextRun().spawn || {}).argv.join(' ').indexOf('--effort xhigh') >= 0,
   'effort: the next run is spawned with --effort xhigh');

/* default is not a level - it means say nothing and leave the CLI's own
   setting alone, which is what every responder written before this key does. */
edit(() => pick('effort', 'default'));
ok((nextRun().spawn || {}).argv.join(' ').indexOf('--effort') < 0,
   'effort: default passes no flag at all');

edit(() => type('What to type', 'RULE-MARKER-42: ask for the input count.'));
ok(((nextRun().spawn || {}).prompt || '').indexOf('RULE-MARKER-42') >= 0,
   'rules: the new text is in the prompt of the next run');

edit(() => type('Goal', 'GOAL-MARKER-7 make it faster'));
ok(((nextRun().spawn || {}).prompt || '').indexOf('GOAL-MARKER-7') >= 0,
   'goal: the new text is in the prompt of the next run');

edit(() => type('Stop when', 'STOP-MARKER-9 every item is priced'));
ok(((nextRun().spawn || {}).prompt || '').indexOf('STOP-MARKER-9') >= 0,
   'stop when: the new text is in the prompt of the next run');

edit(() => pick('context', 'full-session'));
ok(typeof (nextRun().ask || { ctx: {} }).ctx.transcript === 'string',
   'context: the next run carries the transcript full-session asks for');

edit(() => pick('autosend', 'true'));
newReply();
T.maybeRun(); pump(); T.maybeSend();
ok(!T.state().slot, 'autosend: the answer goes without waiting for approval');

edit(() => pick('max_turns', '50'));
ok(String((T.state().meta||{}).max_turns) === '50', 'max_turns: the armed responder holds the new limit');
{
  /* Two things about reading the counter here. The button is redrawn by tick(),
     which dom-stubs captures instead of running, so the product's own timer has
     to be stepped once. And the composer form the button is placed in is not
     under document.body in the stub, so document.querySelector cannot see it -
     the slot has to be walked by hand. */
  globalThis.__tick();
  const find = (n, cls) => {
    for (const c of (n.children || [])) {
      if (String(c.className || '').indexOf(cls) >= 0) return c;
      const hit = find(c, cls);
      if (hit) return hit;
    }
    return null;
  };
  const cn = find(T.btn(), '__afCn');
  ok(!!cn && (cn.textContent || '').indexOf('/50') > 0,
     'max_turns: and the counter on the button shows it, got ' + JSON.stringify(cn && cn.textContent));
}

edit(() => type('Ask once', 'name: budget'
  + String.fromCharCode(10) + 'when: byte-identical'
  + String.fromCharCode(10) + 'ask: ONCE-MARKER-3 what is the whole budget?'));
newReply();
globalThis.__msgs[1].content = 'Run x: the output is byte-identical.';
runs.length = 0;
T.maybeRun(); pump();
if (T.state().slot) { T.approve(); T.maybeSend(); pump(); }
ok(((runs[0] || {}).prompt || '').indexOf('ONCE-MARKER-3') >= 0,
   'ask once: a new question fires on the next matching turn');

/* The limit is read at the top of every maybeRun, so it binds in both
   directions: raised, the loop keeps going; lowered below the count already
   reached, the next attempt disarms instead of running. */
edit(() => pick('max_turns', 'unlimited'));
{
  globalThis.__tick();
  const find = (n, cls) => { for (const c of (n.children || [])) {
    if (String(c.className || '').indexOf(cls) >= 0) return c;
    const hit = find(c, cls); if (hit) return hit; } return null; };
  const cn = find(T.btn(), '__afCn');
  ok(!!cn && (cn.textContent || '').indexOf('/') < 0,
     'max_turns: unlimited takes effect too - the counter loses its limit, got '
     + JSON.stringify(cn && cn.textContent));
}

edit(() => {
  const name = document.querySelector('.__afDlg input.__afIn');
  if (!name) throw new Error('no name input');
  name.value = 'renamed-in-place';
  (name.listeners.input || []).forEach((f) => f({}));
});
ok(T.state().armed === 'perf-skeptic' && (T.state().meta||{}).name === 'renamed-in-place',
   'name: renaming keeps the arming and takes the new name');

console.log(say.join(String.fromCharCode(10)));
const bad = say.filter((l) => l.indexOf('FAIL') === 2).length;
console.log(bad ? '  ' + bad + ' failed' : '  all ' + say.length + ' passed');
process.exit(bad ? 1 : 0);
