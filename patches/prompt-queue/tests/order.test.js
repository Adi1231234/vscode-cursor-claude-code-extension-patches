/* Send order, against the real model.js + schedule-lib.js + schedule-order.js.
 *
 *     node patches/prompt-queue/tests/order.test.js
 *
 * The fragments are eval'd rather than re-implemented, so this pins what the
 * bundle actually ships. What is stubbed is only what they reach out to: the
 * queue array, the pause flag, the busy check and render().
 *
 * Every assertion here is a decision, not a mechanic, and all of them exist
 * because the list used to print an order the queue did not run: a scheduled
 * item kept its position number AND let the row below overtake it. */
const fs = require('fs'), path = require('path');
const DIR = path.resolve(__dirname, '..', 'queue');
const NL = String.fromCharCode(10);

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };

function makeQueue(items) {
  const Q = items || [];
  let idc = 0, paused = false, editing = false, busy = false, panel = null, renders = 0;
  const render = () => { renders++; };
  const isBusy = () => busy;
  const api = {};
  const src = ['schedule-lib.js', 'schedule-order.js', 'model.js']
    .map((f) => fs.readFileSync(path.join(DIR, f), 'utf8')).join(NL) +
    NL + 'api.firstSendableIndex=firstSendableIndex;api.laneItems=laneItems;' +
    'api.floatItems=floatItems;api.laneOrdinal=laneOrdinal;api.gateAbove=gateAbove;' +
    'api.heldBelow=heldBelow;api.gates=gates;api.floats=floats;api.holdDefault=holdDefault;' +
    'api.setSchedule=setSchedule;api.rearmTimer=rearmTimer;api.duplicateItem=duplicateItem;' +
    'api.moveItemTo=moveItemTo;api.armAfterItems=armAfterItems;api.isParked=isParked;';
  eval(src);
  api.Q = Q;
  api.pause = (v) => { paused = v; };
  api.setBusy = (v) => { busy = v; };
  return api;
}

const MIN = 60000;
const soon = () => Date.now() + 10 * MIN;
const past = () => Date.now() - MIN;
const item = (text, extra) => Object.assign({ id: text, text: text, mode: 'queue' }, extra || {});
const timer = (text, at, hold) => item(text, { mode: 'timer', at: at, start: Date.now(), dur: 10 * MIN, hold: hold });
const atTime = (text, at, hold) => item(text, { mode: 'time', at: at, start: Date.now(), dur: 10 * MIN, hold: hold });

/* ---- 1. the bug: a timer at the front holds everything behind it ---- */
let q = makeQueue([timer('first', soon(), true), item('second')]);
ok(q.firstSendableIndex() === -1, 'a pending timer that holds sends nothing, and the item below it does not overtake');
ok(q.laneItems().length === 2 && q.laneOrdinal(q.Q[1]) === 2, 'both are in the lane, and the second is still numbered 2');

q = makeQueue([timer('first', past(), true), item('second')]);
ok(q.firstSendableIndex() === 0, 'once it is due the holding timer sends, still first');

/* ---- 2. the same timer with the hold off leaves the lane ---- */
q = makeQueue([timer('first', soon(), false), item('second')]);
ok(q.firstSendableIndex() === 1, 'a floating timer blocks nothing');
ok(q.laneItems().length === 1 && q.laneOrdinal(q.Q[0]) === 0, 'and it is out of the lane, so it carries no position at all');
ok(q.floatItems().length === 1, 'it is drawn in the scheduled group instead');

/* ---- 3. a floating item is committed to its clock and to nothing else ---- */
q = makeQueue([item('plain'), atTime('later', past(), false)]);
ok(q.firstSendableIndex() === 1, 'a due floating item fires from wherever it sits');
q = makeQueue([item('plain'), atTime('later', soon(), false)]);
ok(q.firstSendableIndex() === 0, 'a pending one is simply not in the way');
q = makeQueue([atTime('gate', soon(), true), atTime('float', past(), false), item('plain')]);
ok(q.firstSendableIndex() === 1, 'and a gate above it does not hold it - it was never in the lane');

/* ---- 4. the pause is the whole panel, scheduled included ---- */
q = makeQueue([atTime('due', past(), false), item('plain')]);
q.pause(true);
ok(q.firstSendableIndex() === -1, 'paused stops a due scheduled item too, so Stop really stops');
q.pause(false);
ok(q.firstSendableIndex() === 0, 'and releases it again');

/* ---- 5. a parked item is never a gate (a skipped gate would deadlock) ---- */
q = makeQueue([timer('skipped', soon(), true), item('second')]);
q.Q[0].off = true;
ok(q.firstSendableIndex() === 1, 'a skipped gate holds nothing');
q = makeQueue([atTime('missed', past(), true), item('second')]);
q.Q[0].missed = true;
ok(q.firstSendableIndex() === 1, 'a missed gate holds nothing');
q = makeQueue([timer('rearm', soon(), true), item('second')]);
q.Q[0].rearm = true;
ok(q.firstSendableIndex() === 1, 'a rearm gate holds nothing');
ok(q.laneItems().length === 2, 'parked items still keep their place in the lane, so un-skipping puts them back');

/* ---- 6. after: unchanged, and still the one mode that only means order ---- */
q = makeQueue([item('after', { mode: 'after', dur: 5 * MIN }), item('second')]);
ok(q.gates(q.Q[0]) && !q.floats(q.Q[0]), 'an after item always gates and never floats');
ok(q.firstSendableIndex() === -1, 'un-armed, it holds the queue');
q.armAfterItems();
ok(q.Q[0].at > Date.now(), 'reaching the front while idle arms it');
ok(q.firstSendableIndex() === -1, 'armed but not due, it still holds');
q.Q[0].at = past();
ok(q.firstSendableIndex() === 0, 'armed and due, it sends');

/* ---- 7. positions are lane positions, so a floating row eats no slot ---- */
q = makeQueue([item('a'), atTime('sched', soon(), false), item('b'), item('c')]);
ok(q.laneOrdinal(q.Q[2]) === 2 && q.laneOrdinal(q.Q[3]) === 3, 'the lane numbers 1..N skip the floating row');
q.moveItemTo(q.Q[3], 1);
ok(q.Q[0].text === 'c', 'moving to lane slot 1 moves to the front of the queue');
q = makeQueue([item('a'), atTime('sched', soon(), false), item('b')]);
q.moveItemTo(q.Q[0], 2);
ok(q.laneItems().map((x) => x.text).join(',') === 'b,a', 'lane slot 2 is measured in lane items, not queue indexes');

/* ---- 8. the two questions the schedule modal asks before it commits ---- */
q = makeQueue([atTime('gate', Date.now() + 60 * MIN, true), item('b'), atTime('mine', soon(), true)]);
ok(q.gateAbove(q.Q[2]) === q.Q[0].at, 'gateAbove reports the latest known hold above an item');
ok(q.gateAbove(q.Q[0]) === 0, 'and nothing above the first one');
ok(q.heldBelow(q.Q[0]) === 2, 'heldBelow counts the lane items that would wait');
q.Q[1].off = true;
ok(q.heldBelow(q.Q[0]) === 1, 'skipped ones are not waiting for anything');

/* ---- 9. the defaults, which are the whole point of keeping two modes ---- */
q = makeQueue([]);
ok(q.holdDefault('timer') === true, 'a duration paces the queue, so a timer holds by default');
ok(q.holdDefault('time') === false, 'an hour is a moment in the world, so at-time does not');

/* ---- 10. the flag survives everything that copies an item ---- */
q = makeQueue([timer('t', soon(), true)]);
q.rearmTimer(q.Q[0]);
ok(q.Q[0].hold === true && q.Q[0].rearm === false, 'restarting a stopped timer keeps its hold - a restart is not a decision');
q.duplicateItem(q.Q[0]);
ok(q.Q[1].hold === true && q.Q[1].mode === 'timer', 'a duplicate holds the queue exactly as its source does');
q.setSchedule(q.Q[1], 'queue');
ok(q.Q[1].hold === false && !q.gates(q.Q[1]) && !q.floats(q.Q[1]), 'clearing a schedule clears the hold with it');

console.log('  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
