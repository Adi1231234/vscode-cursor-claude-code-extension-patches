/* The queue parks on a stop that never passed through its own hook - the
 * phone's Stop, or a tool refused with no reason (queue/stop-pause.js), read
 * through lib/js/ccReply.js.
 *
 *     node patches/prompt-queue/tests/stops.test.js
 *
 * Store rows as in reply.test.js; busy edges as __ccSession hands them out,
 * with initial set on the first value and after a switch of conversation. */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };

const text = (t) => [{ content: { type: 'text', text: t } }];
const reply = (uuid, t) => ({ type: 'assistant', uuid, model: 'claude-opus-5-5', content: text(t) });
const user = (uuid, t) => ({ type: 'user', uuid, content: text(t) });

const window = {};
eval(fs.readFileSync(path.join(ROOT, 'lib', 'js', 'ccReply.js'), 'utf8'));
const R = window.__ccReply;
const store = (list) => ({ messages: { value: list } });
let s, q;
function queueWith(items) {
  let paused = false, renders = 0, logs = [];
  const Q = items.slice(), busyFns = [];
  const render = () => { renders++; };
  const ccLog = (...a) => { logs.push(a.join(' ')); };
  let store0 = null;
  const getSession = () => store0, isBusy = () => false;
  const win = { __ccReply: R, __ccSession: { on: (name, fn) => { if (name === 'busy') busyFns.push(fn); } } };
  const src = fs.readFileSync(path.join(__dirname, '..', 'queue', 'stop-pause.js'), 'utf8').replace(/window\./g, 'win.');
  eval(src + ';watchStopsElsewhere();');
  return {
    busy: (v, st, initial) => { store0 = st; busyFns.forEach((f) => f(v, st, !!initial)); },
    paused: () => paused, logs,
    play: () => { paused = false; restartRunMark(); },
  };
}
s = store([user('u1', 'go')]);
q = queueWith(['next']);
q.busy(true, s);
s.messages.value.push(user('u2', '[Request interrupted by user]'));
q.busy(false, s);
ok(q.paused() && /did not see/.test(q.logs.join()), 'a stop from the phone parks a queue with work in it, and says why');

s = store([user('u1', 'go')]);
q = queueWith(['next']);
q.busy(true, s);
s.messages.value.push(reply('a1', 'finished'));
q.busy(false, s);
ok(!q.paused(), 'a turn that simply finished does not park it');

s = store([user('u1', '[Request interrupted by user]')]);
q = queueWith(['next']);
q.busy(true, s, true);        /* the panel opened mid-run: the first value is no edge */
q.busy(false, s);
ok(!q.paused(), 'a stop before the run was seen starting is not this run\'s');

s = store([]);
q = queueWith([]);
q.busy(true, s);
s.messages.value.push(user('u2', '[Request interrupted by user]'));
q.busy(false, s);
ok(!q.paused(), 'an empty queue has nothing to park');

/* A switch of conversation reports the new store as initial: a mark from the
   old one must not be read against it. */
s = store([user('u1', 'go')]);
let other = store([user('x1', '[Request interrupted by user]'), user('x2', 'more')]);
q = queueWith(['next']);
q.busy(true, s);
q.busy(false, other, true);
ok(!q.paused(), 'a switch to an idle conversation with an old stop in it does not park');

/* Stop, then Play before the stopped run has wound down: the Play stands. */
s = store([user('u1', 'go')]);
q = queueWith(['next']);
q.busy(true, s);
s.messages.value.push(user('u2', '[Request interrupted by user]'));
q.play();
q.busy(false, s);
ok(!q.paused(), 'a Play after the stop is not overruled when the run ends');
s = store([user('u1', 'go')]);
q = queueWith(['next']);
q.busy(true, s);
q.play();
s.messages.value.push(user('u2', '[Request interrupted by user]'));
q.busy(false, s);
ok(q.paused(), 'but a stop after the Play still parks');

console.log(fail ? fail + ' failed, ' + pass + ' passed' : pass + ' passed');
process.exit(fail ? 1 : 0);
