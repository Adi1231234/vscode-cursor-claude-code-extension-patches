/* The saved-queues store, against the real saved/store.js.
 *
 *     node patches/prompt-queue/tests/saved.test.js
 *
 * The fragment is eval'd, not re-implemented: a test that restates the rules it
 * is checking passes whatever the shipped file says. What is stubbed here is
 * only what the fragment reaches OUT to - localStorage, the live queue and the
 * three things it calls on it - which is the boundary a unit test is for.
 *
 * The rules being pinned are the ones with a reason behind them, all of which
 * are decisions rather than mechanics: an at-time cannot be replayed, a data
 * URL must not live in localStorage for ever, a loaded timer must not arm
 * itself because a due timer fires THROUGH the paused hold, and loading parks
 * the queue exactly as one typed add does. */
const fs = require('fs'), path = require('path');
const SRC = path.resolve(__dirname, '..', 'saved', 'store.js');
const NL = String.fromCharCode(10);

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };

/* ---- the harness the fragment runs in ---- */
function makeStore(opts) {
  opts = opts || {};
  const mem = {};
  const localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { if (opts.full) { const e = new Error('quota'); throw e; } mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; }
  };
  let idc = 0, paused = false, renders = 0;
  const Q = opts.Q || [];
  const isBusy = () => !!opts.busy;
  const render = () => { renders++; };
  const ccLog = () => {};
  const api = {};
  const src = fs.readFileSync(SRC, 'utf8') +
    NL + 'api.savedRead=savedRead;api.savedWrite=savedWrite;api.savedAdd=savedAdd;' +
    'api.savedPut=savedPut;api.savedDrop=savedDrop;api.savedItemOf=savedItemOf;' +
    'api.queueItemOf=queueItemOf;api.loadSavedInto=loadSavedInto;' +
    'api.savedPreview=savedPreview;api.suggestSavedName=suggestSavedName;' +
    'api.countLabel=countLabel;api.SKEY=SKEY;api.SMAX=SMAX;';
  eval(src);
  api.mem = mem;
  api.Q = Q;
  api.paused = () => paused;
  api.renders = () => renders;
  return api;
}

/* ---- 1. what a saved item keeps, and what it drops ---- */
const s = makeStore();
const plain = s.savedItemOf({ text: 'do the thing', mode: 'queue' });
ok(plain.t === 'do the thing' && plain.o === undefined && plain.md === undefined, 'a plain item is just its text');
ok(s.savedItemOf({ text: 'x', off: true }).o === 1, 'the skipped flag is kept');
const timer = s.savedItemOf({ text: 'x', mode: 'timer', dur: 600000, at: Date.now() + 1 });
ok(timer.md === 'timer' && timer.du === 600000 && timer.at === undefined, 'a timer keeps its duration, never its target');
const after = s.savedItemOf({ text: 'x', mode: 'after', dur: 300000 });
ok(after.md === 'after' && after.du === 300000, 'an after keeps its duration');
const atTime = s.savedItemOf({ text: 'x', mode: 'time', at: Date.now() + 3600000, dur: 3600000 });
ok(atTime.md === undefined, 'an at-time degrades to a plain item - one wall-clock moment cannot be replayed');
const withFiles = s.savedItemOf({ text: 'x', files: [{ name: 'a.png', dataUrl: 'data:image/png;base64,AAA' }] });
ok(JSON.stringify(withFiles).indexOf('data:') < 0, 'attachments never reach the store');

/* ---- 2. and what comes back ---- */
const backPlain = s.queueItemOf({ t: 'hello' });
ok(backPlain.text === 'hello' && backPlain.mode === 'queue' && backPlain.off === false, 'a plain item restores plain');
ok(backPlain.files.length === 0 && backPlain.auto === false, 'restored with no files and not marked written');
const backTimer = s.queueItemOf({ t: 'x', md: 'timer', du: 600000 });
ok(backTimer.mode === 'timer' && backTimer.rearm === true && backTimer.at === null,
   'a timer restores INACTIVE - a due timer fires through the paused hold, so arming it would send behind the user');
const backAfter = s.queueItemOf({ t: 'x', md: 'after', du: 300000 });
ok(backAfter.mode === 'after' && backAfter.rearm === false && backAfter.dur === 300000,
   'an after restores live - it arms itself by position and needs no origin');
ok(s.queueItemOf({ t: 'x', o: 1 }).off === true, 'the skipped flag survives the round trip');
const rt = s.savedItemOf(s.queueItemOf({ t: 'x', o: 1, md: 'after', du: 60000 }));
ok(rt.t === 'x' && rt.o === 1 && rt.md === 'after' && rt.du === 60000, 'draft round trip is stable (this is what the editor saves)');

/* ---- 3. the store itself ---- */
ok(s.savedRead().length === 0, 'an empty store reads as an empty list');
const id = s.savedAdd('First', [{ t: 'a' }]);
ok(typeof id === 'string' && id.length > 3, 'savedAdd returns the new id, so the dialog can point at the row');
ok(s.savedRead().length === 1 && s.savedRead()[0].name === 'First', 'it is there');
const id2 = s.savedAdd('Second', [{ t: 'b' }]);
ok(s.savedRead()[0].id === id2, 'newest first');
ok(JSON.parse(s.mem[s.SKEY]).v === 1, 'the envelope carries a version');
ok(s.savedPut(id, 'Renamed', [{ t: 'c' }, { t: 'd' }]), 'savedPut reports success');
const put = s.savedRead().filter((e) => e.id === id)[0];
ok(put.name === 'Renamed' && put.items.length === 2, 'savedPut replaced the name and the items');
ok(s.savedPut('nope', 'x', []) === false, 'savedPut on an unknown id reports failure rather than adding one');
s.savedDrop(id2);
ok(s.savedRead().length === 1 && s.savedRead()[0].id === id, 'savedDrop removes exactly one');

/* ---- 4. it survives a store it did not write ---- */
const junk = makeStore();
junk.mem[junk.SKEY] = '{not json';
ok(junk.savedRead().length === 0, 'corrupt JSON reads as empty instead of throwing');
junk.mem[junk.SKEY] = JSON.stringify({ v: 1 });
ok(junk.savedRead().length === 0, 'a missing list reads as empty');
const full = makeStore({ full: true });
ok(full.savedAdd('x', [{ t: 'y' }]) === null, 'a refused write returns null rather than a bad id');

/* ---- 5. the cap ---- */
const many = makeStore();
const over = [];
for (let i = 0; i < many.SMAX + 10; i++) over.push({ id: 'e' + i, name: 'n' + i, ts: i, items: [] });
many.savedWrite(over);
ok(many.savedRead().length === many.SMAX, 'the list is capped at SMAX (' + many.SMAX + ')');

/* ---- 6. loading parks the queue, and appends ---- */
const idle = makeStore({ Q: [{ text: 'already here' }] });
const n = idle.loadSavedInto({ name: 'x', items: [{ t: 'one' }, { t: 'two', o: 1 }] });
ok(n === 2 && idle.Q.length === 3, 'loading APPENDS - it never replaces what is queued');
ok(idle.Q[2].off === true, 'a skipped item arrives skipped');
ok(idle.paused() === true, 'loading while idle parks the queue, like any explicit add');
ok(idle.renders() === 1, 'and renders once');
const busy = makeStore({ Q: [], busy: true });
busy.loadSavedInto({ name: 'x', items: [{ t: 'one' }] });
ok(busy.paused() === false, 'loading mid-turn does not park - the queue drains after the turn as usual');
const nothing = makeStore({ Q: [] });
nothing.loadSavedInto({ name: 'x', items: [] });
ok(nothing.paused() === false, 'loading an empty queue parks nothing');

/* ---- 7. the strings the row is made of ---- */
const t = makeStore();
ok(t.countLabel(1) === '1 message' && t.countLabel(2) === '2 messages', 'countLabel is singular at one');
ok(t.savedPreview({ items: [{ t: 'a' }, { t: 'b' }] }) === 'a · b', 'the preview is the prompts, with no count in front of them');
ok(t.savedPreview({ items: [{ t: 'a' + NL + 'b  c' }] }) === 'a b c', 'newlines and runs of spaces collapse to one line');
ok(t.savedPreview({ items: [] }) === '', 'an empty queue previews as nothing');
const long = makeStore({ Q: [{ text: 'x'.repeat(80) }] });
ok(long.suggestSavedName().length <= 45 && long.suggestSavedName().slice(-3) === '...', 'a long first prompt is trimmed for the name');
const named = makeStore({ Q: [{ text: '  keep   this ' + NL + 'short  ' }] });
ok(named.suggestSavedName() === 'keep this short', 'the suggestion is the first prompt on one line');
ok(makeStore({ Q: [] }).suggestSavedName() === '', 'an empty queue suggests nothing');

console.log('  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
