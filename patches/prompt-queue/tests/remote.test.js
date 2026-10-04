/* The phone's view of the queue, against the real remote-api.js +
 * remote-item.js + model.js + schedule-lib.js + schedule-order.js.
 *
 *     node patches/prompt-queue/tests/remote.test.js
 *
 * Eval'd rather than re-implemented, like order.test.js (remote-harness.js).
 * What is pinned is the contract patches/phone-queue relies on: the numbers
 * the phone shows address the same rows the panel draws, every edit goes
 * through the panel's own function, and a refusal says why instead of doing
 * something else. The menu's own forms are remote-item.test.js. */
const { makeQueue, item, floating, MIN } = require('./remote-harness.js');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };

/* ---- 1. the list is the panel's: scheduled group apart, lane numbered ---- */
let q = makeQueue([item('a'), floating('later', Date.now() + 60 * MIN), item('b')]);
let r = q.run({ op: 'list' });
ok(r.error === '', 'list is not an error');
ok(r.queue.lane.map((x) => x.text).join() === 'a,b', 'the lane leaves the floating item out, as the panel does');
ok(r.queue.scheduled.length === 1 && r.queue.scheduled[0].text === 'later', 'the floating item is in the scheduled group');
ok(q.sid() === 'sid-1', 'sid() reads the conversation now, without waiting for a pass (a new tab\'s first /queue)');

/* ---- 2. numbers address the rows the panel numbers ---- */
q = makeQueue([item('a'), floating('later', Date.now() + 60 * MIN), item('b')]);
r = q.run({ op: 'del', ref: '2' });
ok(r.error === '' && q.Q.map((x) => x.text).join() === 'a,later', '"2" is the second lane row, not the second array slot');
r = q.run({ op: 'del', ref: 's1' });
ok(r.error === '' && q.Q.map((x) => x.text).join() === 'a', '"s1" is the first scheduled row');
r = q.run({ op: 'del', ref: '9' });
ok(/no item 9/i.test(r.error) && q.Q.length === 1, 'a number with no row says so and deletes nothing');

/* ---- 3. pause and play are the panel's own button ---- */
q = makeQueue([item('a')]);
q.run({ op: 'pause' });
ok(q.paused() === true, 'pause holds the queue');
q.run({ op: 'play' });
ok(q.paused() === false && q.flushes() === 1, 'play releases it and, while idle, sends at once - as the play button does');
q.run({ op: 'pause' }); q.setBusy(true); q.run({ op: 'play' });
ok(q.flushes() === 1, 'play while Claude works leaves the send to the end of the turn');

/* ---- 4. add: an ordinary item, or one with the schedule the panel would give it ---- */
q = makeQueue([]);
r = q.run({ op: 'add', mode: 'queue', text: 'hello' });
ok(r.error === '' && q.Q.length === 1 && q.Q[0].text === 'hello' && q.paused() === false,
  'a plain add appends and does not pause the queue (unlike Alt+Enter)');
r = q.run({ op: 'add', mode: 'timer', dur: 10 * MIN, text: 't' });
let t = q.Q[1];
ok(t.mode === 'timer' && t.hold === true && Math.abs(t.at - (Date.now() + 10 * MIN)) < 2000, 'a timer runs from now and holds by default');
r = q.run({ op: 'add', mode: 'time', at: Date.now() + 30 * MIN, text: 'at' });
ok(q.Q[2].mode === 'time' && q.Q[2].hold === false, 'an at-time does not hold by default');
r = q.run({ op: 'add', mode: 'time', at: Date.now() + 30 * MIN, hold: true, text: 'at2' });
ok(q.Q[3].hold === true, 'an explicit hold is kept');
r = q.run({ op: 'add', mode: 'after', dur: 5 * MIN, text: 'af' });
ok(q.Q[4].mode === 'after' && q.Q[4].dur === 5 * MIN && !q.Q[4].at, 'an after item waits to be armed');
r = q.run({ op: 'add', mode: 'time', at: Date.now() - MIN, text: 'past' });
ok(/passed/.test(r.error) && q.Q.length === 5, 'a moment already gone is refused, not queued');
r = q.run({ op: 'add', mode: 'queue', text: '   ' });
ok(/nothing/i.test(r.error) && q.Q.length === 5, 'an empty add is refused');

/* ---- 5. the row actions ---- */
q = makeQueue([item('a'), item('b'), item('c')]);
q.run({ op: 'move', ref: '3', to: 1 });
ok(q.Q.map((x) => x.text).join() === 'c,a,b', 'move puts a row at the given place');
q.run({ op: 'skip', ref: '2' });
ok(q.Q[1].off === true, 'skip toggles the row');
r = q.run({ op: 'now', ref: '2' });
ok(/skipped/i.test(r.error) && q.sentNow.length === 0, 'send-now on a skipped row gives the row menu\'s own reason');
r = q.run({ op: 'now', ref: '1' });
ok(r.error === '' && q.sentNow[0].text === 'c', 'send-now sends that row');
r = q.run({ op: 'edit', ref: '1', text: 'A2' });
ok(q.Q[0].text === 'A2', 'edit replaces the text');

q = makeQueue([floating('later', Date.now() + 60 * MIN)]);
r = q.run({ op: 'move', ref: 's1', to: 1 });
ok(/scheduled/i.test(r.error), 'a scheduled row has no place in the order to move to');

/* ---- the menu addresses the item itself, so a shift cannot redirect a tap ---- */
q = makeQueue([item('a', { id: 7 }), item('b', { id: 8 })]);
r = q.run({ op: 'list' });
ok(r.queue.lane[1].id === 8, 'the snapshot carries each item\'s identity');
q.Q.splice(0, 1);                       /* "a" was sent while the phone was tapping */
r = q.run({ op: 'del', ref: 'id:8' });
ok(r.error === '' && q.Q.length === 0, 'id:8 still reaches "b" after the row above it left');
r = q.run({ op: 'del', ref: 'id:8' });
ok(/no longer/.test(r.error), 'an item that is gone says so, and nothing else is touched');

/* ---- when: the schedule of an item already queued ---- */
q = makeQueue([item('a', { id: 1 }), item('b', { id: 2 })]);
r = q.run({ op: 'when', ref: 'id:2', mode: 'timer', dur: 10 * MIN });
ok(r.error === '' && q.Q[1].mode === 'timer' && q.Q[1].hold === true, 'a timer is set on an existing item, holding by default');
q.run({ op: 'when', ref: 'id:2', mode: 'time', at: Date.now() + 60 * MIN, hold: true });
ok(q.Q[1].mode === 'time' && q.Q[1].hold === true, 'an at-time with an explicit hold');
q.run({ op: 'when', ref: 'id:2', mode: 'queue' });
ok(q.Q[1].mode === 'queue' && !q.Q[1].at && q.Q[1].hold === false, '"in its turn" clears the schedule');
r = q.run({ op: 'when', ref: 'id:2', mode: 'time', at: Date.now() - MIN });
ok(/passed/.test(r.error) && q.Q[1].mode === 'queue', 'a moment already gone is refused');

r = q.run({ op: 'bogus' });
ok(r.error !== '' && r.queue, 'an unknown command is an error, with the queue still attached');

console.log(fail ? fail + ' failed, ' + pass + ' passed' : pass + ' passed');
process.exit(fail ? 1 : 0);
