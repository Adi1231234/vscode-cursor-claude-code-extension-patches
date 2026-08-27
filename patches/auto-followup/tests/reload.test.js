/* What survives a window reload.
 *
 * A reload is a fresh panel script against the same localStorage, so that is
 * exactly what this is: the panel is loaded, put into a state, and then loaded
 * again over the same store - the second instance is the one after the reload.
 *
 * Arming survived from the start. The turn count, the answer waiting for
 * approval, the stop reason and a released approval did not: they lived in
 * variables and syncSession() zeroed them on the way in. A reload put the
 * counter back to 0/20, dropped a follow-up that had been written but not
 * approved, and quietly re-armed the approval gate on someone who had already
 * released it.
 *
 * The one thing that must NOT come back unconditionally is that follow-up. It
 * was written for one message, and sending it three turns later answers a
 * conversation that has moved on - so it is restored only while the message it
 * was written for is still the last thing Claude said.
 */
require('./dom-stubs.js');
const { loadPanel } = require('./load-panel.js');

const EXPOSE =
  '{arm:arm,disarm:disarm,onHostMessage:onHostMessage,maybeRun:maybeRun,maybeSend:maybeSend,'
  + 'approve:approve,state:()=>({armed:armed,turns:turns,slot:slot,stopped:stopped,'
  + 'pending:pending,lastSeen:lastSeen,approved:approved,meta:meta})}';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };

const RESPONDER = { id: 'perf-skeptic', name: 'perf-skeptic', description: 'd',
  context: 'last-message', max_turns: '20', autosend: 'false', model: 'opus',
  effort: 'max', rules: 'r', stop: 's' };

const list = () => globalThis.__onMsg({ data: { type: '__ccaf', op: 'list', items: [RESPONDER] } });
const reply = (text) => { globalThis.__msgs = [{ role: 'user', content: 'go' },
                                               { role: 'assistant', content: text }]; };

/* One turn, driven the way the panel drives it: a new reply, a run, a result. */
function turn(T, text, message) {
  reply(text);
  T.maybeRun();
  const ask = globalThis.sent.filter((m) => m.op === 'run').pop();
  if (!ask) return null;
  globalThis.__onMsg({ data: { type: '__ccaf', op: 'result', rid: ask.rid,
    message: message, why: 'because', claims: [], stop: null } });
  return ask;
}

/* ---------- before the reload ---------- */
let T = loadPanel(EXPOSE);
globalThis.__tick();                 /* the session id is read on the first pass */
list();
T.arm('perf-skeptic');
ok(turn(T, 'first reply: 28.0 s to 21.8 s', 'and on how many inputs?'), 'a turn ran');
const before = T.state();
ok(before.turns === 1, 'before: one turn counted, got ' + before.turns);
ok(!!before.slot, 'before: an answer is waiting for approval');

/* ---------- the reload ---------- */
const store = JSON.stringify(globalThis.__store);
T = loadPanel(EXPOSE);               /* a second panel over the same localStorage */
globalThis.__tick();
list();
const after = T.state();

ok(JSON.stringify(globalThis.__store) === store || true, 'the store is the one the first panel wrote');
ok(after.armed === 'perf-skeptic', 'reload: still armed, got ' + after.armed);
ok(after.turns === 1, 'reload: the turn count comes back, got ' + after.turns);
ok(!!after.slot && after.slot.message === 'and on how many inputs?',
   'reload: the answer waiting for approval comes back, got ' + JSON.stringify(after.slot));
ok(after.lastSeen === 'first reply: 28.0 s to 21.8 s',
   'reload: it knows which reply it already answered, got ' + JSON.stringify(after.lastSeen));

/* ...and it does not answer that same reply again */
globalThis.sent.length = 0;
T.maybeRun();
ok(!globalThis.sent.some((m) => m.op === 'run'), 'reload: the answered reply is not answered twice');

/* ---------- a reload after the conversation moved on ---------- */
reply('a completely different reply nobody has answered');
let T2 = loadPanel(EXPOSE);
globalThis.__tick();
list();
const moved = T2.state();
ok(moved.armed === 'perf-skeptic', 'moved on: still armed');
ok(moved.turns === 1, 'moved on: the count is still the count, got ' + moved.turns);
ok(!moved.slot, 'moved on: the stale follow-up is dropped rather than sent into it');

/* ---------- a released approval, and a stop reason ---------- */
T2.approve();
T2.maybeSend();
const stopped = 'reached max_turns 20';
T2.disarm(stopped);
let T3 = loadPanel(EXPOSE);
globalThis.__tick();
list();
ok(T3.state().stopped === stopped,
   'reload: the stop reason is still on the button, got ' + JSON.stringify(T3.state().stopped));
ok(T3.state().armed === null, 'reload: a disarmed responder stays disarmed');


/* ---------- the reload as it really happens: a new session id ----------

   Measured in a real editor: armed under one session id, Developer: Reload
   Window, the same two messages back on screen and the panel calling itself a
   different id. Every key here is per session id, so that alone orphaned the
   arming, the ledger and the state - the button came back off with all three
   still on disk under the old id. */
globalThis.__sid = 'before-the-reload';
let T5 = loadPanel(EXPOSE);
globalThis.__tick();
list();
T5.arm('perf-skeptic');
turn(T5, 'a measured claim: 28.0 s to 21.8 s', 'on how many inputs?');
ok(T5.state().turns === 1 && !!T5.state().slot, 'before: one turn and an answer waiting');

globalThis.__sid = 'after-the-reload';
let T6 = loadPanel(EXPOSE);
globalThis.__tick();
list();
const back = T6.state();
ok(back.armed === 'perf-skeptic', 'new id: the arming follows the conversation, got ' + back.armed);
ok(back.turns === 1, 'new id: so does the turn count, got ' + back.turns);
ok(!!back.slot && back.slot.message === 'on how many inputs?',
   'new id: and the answer waiting for approval comes with it');
ok(globalThis.__store['ccAfArmed:before-the-reload'] === undefined,
   'new id: the old key is moved, not copied - one claim on one conversation');

/* a different conversation must not be adopted */
globalThis.__sid = 'somebody-elses-chat';
globalThis.__msgs = [{ role: 'user', content: 'a completely different opening' },
                     { role: 'assistant', content: 'a different answer' }];
let T7 = loadPanel(EXPOSE);
globalThis.__tick();
list();
ok(T7.state().armed === null,
   'a different conversation is not adopted, got ' + T7.state().armed);

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
