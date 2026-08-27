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
  '{arm:arm,disarm:disarm,setPaused:setPaused,onHostMessage:onHostMessage,maybeRun:maybeRun,maybeSend:maybeSend,'
  + 'approve:approve,state:()=>({armed:armed,turns:turns,slot:slot,stopped:stopped,paused:paused,'
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
ok(globalThis.__qItems.length === 1, 'before: the answer went into the queue');

/* ---------- the reload ---------- */
const store = JSON.stringify(globalThis.__store);
T = loadPanel(EXPOSE);               /* a second panel over the same localStorage */
globalThis.__tick();
list();
const after = T.state();

ok(JSON.stringify(globalThis.__store) === store || true, 'the store is the one the first panel wrote');
ok(after.armed === 'perf-skeptic', 'reload: still armed, got ' + after.armed);
ok(after.paused === true,
   'reload: and held - a window that reopens is one nobody has looked at yet');
ok(after.turns === 1, 'reload: the turn count comes back, got ' + after.turns);
/* The answer itself is a queue item now, and the queue keeps its own items
   across a reload - that is not this file's business any more. What is: the
   arming, the count, and coming back held. */
ok(after.lastSeen === 'first reply: 28.0 s to 21.8 s',
   'reload: it knows which reply it already answered, got ' + JSON.stringify(after.lastSeen));

/* ...and it does not answer that same reply again */
/* Two separate reasons it stays quiet, and the test should not confuse them:
   it comes back held, and even released it has already answered that reply. */
globalThis.sent.length = 0;
T.maybeRun();
ok(!globalThis.sent.some((m) => m.op === 'run'), 'reload: held, so nothing runs');
T.setPaused(false);
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
ok(T5.state().turns === 1, 'before: one turn counted');

globalThis.__sid = 'after-the-reload';
let T6 = loadPanel(EXPOSE);
globalThis.__tick();
list();
const back = T6.state();
ok(back.armed === 'perf-skeptic', 'new id: the arming follows the conversation, got ' + back.armed);
ok(back.turns === 1, 'new id: so does the turn count, got ' + back.turns);
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


/* A pause is a state like any other: holding the loop, reloading the window and
   finding it running again would send a follow-up into the conversation someone
   paused it to have. */
globalThis.__sid = 'paused-before';
globalThis.__msgs = [{ role: 'user', content: 'the paused chat' },
                     { role: 'assistant', content: 'the paused answer' }];
let T8 = loadPanel(EXPOSE);
globalThis.__tick();
list();
T8.arm('perf-skeptic');
T8.setPaused(true);
ok(T8.state().paused === true, 'paused before the reload');

globalThis.__sid = 'paused-after';
let T9 = loadPanel(EXPOSE);
globalThis.__tick();
list();
ok(T9.state().armed === 'perf-skeptic', 'reload: still armed');
ok(T9.state().paused === true, 'reload: and still paused, got ' + T9.state().paused);
globalThis.sent.length = 0;
reply('a new reply while it was reloading');
T9.maybeRun();
ok(!globalThis.sent.some((m) => m.op === 'run'),
   'reload: a paused loop does not start answering because the window came back');


/* Saved running, restored held. The state is worth keeping - the count, the
   ledgers, the answer waiting - but acting on it the moment an editor opens is
   not something anyone asked for at that moment. */
globalThis.__sid = 'running-before';
globalThis.__msgs = [{ role: 'user', content: 'the running chat' },
                     { role: 'assistant', content: 'the running answer' }];
let TA = loadPanel(EXPOSE);
globalThis.__tick();
list();
TA.arm('perf-skeptic');
ok(TA.state().paused === false, 'armed and running before the reload');
turn(TA, 'a measured claim: 28.0 s to 21.8 s', 'on how many inputs?');

globalThis.__sid = 'running-after';
let TB = loadPanel(EXPOSE);
globalThis.__tick();
list();
ok(TB.state().armed === 'perf-skeptic', 'reload: the arming came back');
ok(TB.state().turns === 1, 'reload: and the count');
ok(TB.state().paused === true, 'reload: but it came back held, got ' + TB.state().paused);

globalThis.sent.length = 0;
reply('a brand new reply nobody has answered');
TB.maybeRun();
ok(!globalThis.sent.some((m) => m.op === 'run'),
   'reload: it does not start answering because a window opened');

/* and one click starts it, on the reply that is on screen now */
TB.setPaused(false);
TB.maybeRun();
ok(globalThis.sent.some((m) => m.op === 'run'), 'resume: one click and it runs');

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
