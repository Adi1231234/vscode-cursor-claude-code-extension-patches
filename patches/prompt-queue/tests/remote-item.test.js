/* What the phone's menu sends, against the real queue (remote-harness.js).
 *
 *     node patches/prompt-queue/tests/remote-item.test.js
 *
 * The menu takes several taps to reach an action, and the queue can move
 * under it meanwhile: an item sent, another added. So a command says what it
 * means - which way a skip goes, "up" rather than a place - and the answer
 * names the item it acted on, so the phone can say which one it was. And a
 * schedule the queue cannot keep is refused rather than stored broken. */
const { makeQueue, item, MIN } = require('./remote-harness.js');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };
const order = (q) => q.Q.map((x) => x.text).join();

/* ---- the answer names the item ---- */
let q = makeQueue([item('a', { id: 1 }), item('b', { id: 2 })]);
let r = q.run({ op: 'del', ref: '2' });
ok(r.item && r.item.text === 'b' && r.item.id === 2, 'a delete answers with the item it deleted');
r = q.run({ op: 'add', mode: 'queue', text: 'c' });
ok(r.item && r.item.text === 'c', 'an add answers with the new item');
r = q.run({ op: 'del', ref: '9' });
ok(r.item === null, 'nothing acted on: no item');
r = q.run({ op: 'pause' });
ok(r.item === null && r.error === '', 'a command on the whole queue: no item');

/* ---- a skip says which way it goes ---- */
q = makeQueue([item('a', { id: 1 })]);
q.run({ op: 'skip', ref: 'id:1', off: true });
q.run({ op: 'skip', ref: 'id:1', off: true });
ok(q.Q[0].off === true, 'two taps on "Skip" skip it, they do not toggle it back');
q.run({ op: 'skip', ref: 'id:1', off: false });
ok(q.Q[0].off === false, '"Un-skip" brings it back');
q.run({ op: 'skip', ref: '1' });
ok(q.Q[0].off === true, 'a typed skip, with no direction, still toggles');

/* ---- a move says where, from where the item is now ---- */
q = makeQueue(['a', 'b', 'c', 'd'].map((t, i) => item(t, { id: i + 1 })));
q.run({ op: 'move', ref: 'id:3', to: 'up' });
ok(order(q) === 'a,c,b,d', 'up is one place up');
q.Q.splice(0, 1);                      /* "a" was sent while the next tap was on its way */
q.run({ op: 'move', ref: 'id:3', to: 'up' });
ok(order(q) === 'c,b,d', 'up again is one up from where it is now, not from the old list');
q.run({ op: 'move', ref: 'id:3', to: 'bottom' });
ok(order(q) === 'b,d,c', 'bottom is the end');
q.run({ op: 'move', ref: 'id:3', to: 'top' });
q.run({ op: 'move', ref: 'id:3', to: 'up' });
ok(order(q) === 'c,b,d', 'up at the top stays at the top');
q.run({ op: 'move', ref: 'id:2', to: 'down' });
ok(order(q) === 'c,d,b', 'down is one place down');

/* ---- a schedule the queue cannot keep is refused ---- */
q = makeQueue([item('a', { id: 1 })]);
r = q.run({ op: 'add', mode: 'timer', text: 'x' });
ok(/length/.test(r.error) && q.Q.length === 1, 'a timer with no length is refused, not stored with a NaN time');
r = q.run({ op: 'add', mode: 'after', dur: 0, text: 'x' });
ok(/length/.test(r.error) && q.Q.length === 1, 'an "after" of nothing is refused');
r = q.run({ op: 'when', ref: 'id:1', mode: 'time', at: 'soon' });
ok(/time/.test(r.error) && q.Q[0].mode === 'queue', 'a time that is not a time is refused');
r = q.run({ op: 'when', ref: 'id:1', mode: 'timer', dur: 10 * MIN });
ok(r.error === '' && q.Q[0].mode === 'timer', 'and a good one still goes through');

console.log(fail ? fail + ' failed, ' + pass + ' passed' : pass + ' passed');
process.exit(fail ? 1 : 0);
