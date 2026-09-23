/* The queue gate's predicate, against every shape of queue it can meet.
 *
 * The live queue can be driven in the lab (two items in, one toast out), but
 * only for the ordinary case. The cases that matter most are the ones that
 * decide whether a notification is lost for ever - a paused queue, a panel with
 * no queue patch installed, a queue whose methods throw - and those are pinned
 * here instead of hoped for.
 *
 *   node patches/panel-settings/tests/queue-gate.test.js
 */
const fs = require('fs');
const path = require('path');

// queue-gate.js is a single function declaration, so evaluating it just defines
// it; nothing runs until it is called.
eval(fs.readFileSync(path.resolve(__dirname, '..', 'runtime', 'queue-gate.js'), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };

const withQueue = (q) => { globalThis.window = q === undefined ? {} : { __qAuto: q }; };

// pending === true means "hold the toast, more is coming"
withQueue({ count: () => 2, paused: () => false });
ok(__ccSettingsQueuePending() === true, 'two queued and running: must hold');

withQueue({ count: () => 1, paused: () => false });
ok(__ccSettingsQueuePending() === true, 'one queued and running: must hold');

withQueue({ count: () => 0, paused: () => false });
ok(__ccSettingsQueuePending() === false, 'empty queue: must notify');

// A held queue will never send, so this run WAS the last one. Getting this
// wrong means never notifying again for as long as the queue stays paused.
withQueue({ count: () => 5, paused: () => true });
ok(__ccSettingsQueuePending() === false, 'paused queue: must notify, not wait for ever');

// The queue patch is optional; a panel without it has nothing to wait for.
withQueue(undefined);
ok(__ccSettingsQueuePending() === false, 'no queue patch installed: must notify');

globalThis.window = { __qAuto: {} };
ok(__ccSettingsQueuePending() === false, 'queue api without count(): must notify');

withQueue({ count: () => { throw new Error('boom'); }, paused: () => false });
ok(__ccSettingsQueuePending() === false, 'count() throwing: must notify, not swallow');

withQueue({ count: () => 2, paused: () => { throw new Error('boom'); } });
ok(__ccSettingsQueuePending() === false, 'paused() throwing: must notify, not swallow');

// paused() is optional on older queue builds: absent means "not paused"
globalThis.window = { __qAuto: { count: () => 3 } };
ok(__ccSettingsQueuePending() === true, 'queue without paused(): still holds while items remain');

console.log((fail ? 'FAILED' : 'ok') + ' - ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
