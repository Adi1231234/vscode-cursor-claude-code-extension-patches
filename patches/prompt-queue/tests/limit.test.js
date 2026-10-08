/* The queue parks when a turn ends on a usage limit (queue/usage-limit.js),
 * read from the CLI's rate_limit_event frames on their way into the store.
 *
 *     node patches/prompt-queue/tests/limit.test.js
 *
 * session.js and usage-limit.js run themselves, eval'd; the store is a plain
 * object with the app's processIncomingMessage, and busy edges arrive as
 * __ccSession hands them out (initial set on the first value). */
const fs = require('fs'), path = require('path');
const QDIR = path.join(__dirname, '..', 'queue');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };

const HOUR = 3600;
const frame = (info) => ({ type: 'rate_limit_event', rate_limit_info: info });
const rejected = (extra) => frame(Object.assign({ status: 'rejected', rateLimitType: 'seven_day',
  resetsAt: Math.floor(Date.now() / 1000) + 30 * HOUR }, extra || {}));

function queueWith(items) {
  let paused = false;
  const Q = items.slice(), busyFns = [], logs = [], seen = [];
  const render = () => {}, ccLog = (...a) => { logs.push(a.join(' ')); };
  const el = (tag, cls) => ({ className: cls, textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  const fmtClock = (ms) => new Date(ms).toISOString().slice(11, 16);
  const store = { processIncomingMessage(m) { seen.push(m); } };
  const globalThis = { __ccStore: () => store };
  const window = { __ccSession: { on: (name, fn) => { if (name === 'busy') busyFns.push(fn); } } };
  const read = (f) => fs.readFileSync(path.join(QDIR, f), 'utf8');
  eval(read('session.js') + read('usage-limit.js') + ';watchUsageLimit();hookRateLimit();');
  return {
    frame: (m) => store.processIncomingMessage(m),
    busy: (v, initial) => busyFns.forEach((f) => f(v, store, !!initial)),
    rehook: () => hookRateLimit(),
    paused: () => paused, play: () => { paused = false; }, logs, seen,
    badge: () => buildLimitBadge()
  };
}

let q = queueWith(['next', 'after']);
q.busy(true);
q.frame(rejected());
q.frame({ type: 'result' });
q.busy(false);
ok(q.paused(), 'a turn that ended on a weekly limit parks the queue');
ok(/weekly limit, resets/.test(q.logs.join()), 'and the log says which limit and when it resets');
ok(q.seen.length === 2, 'every frame still reaches the store (the app call is not altered)');
ok(q.badge().textContent === 'usage limit' && /weekly limit/.test(q.badge().attrs.title), 'the header says why it is paused');

q = queueWith(['next']);
q.busy(true);
q.frame(frame({ status: 'allowed', rateLimitType: 'five_hour' }));
q.busy(false);
ok(!q.paused(), 'a turn that simply finished does not park it');
ok(q.badge().textContent === '', 'and there is no badge');

q = queueWith(['next']);
q.busy(true);
q.frame(rejected({ overageStatus: 'allowed' }));
q.busy(false);
ok(!q.paused(), 'a rejection usage credits cover is not a limit (the app reads it the same way)');

q = queueWith(['next']);
q.busy(true);
q.frame(rejected());
q.frame(frame({ status: 'allowed' }));
q.busy(false);
ok(!q.paused(), 'an allowed frame after the rejection clears it');

q = queueWith(['next']);
q.frame(rejected({ resetsAt: Math.floor(Date.now() / 1000) - 60 }));
q.busy(true);
q.busy(false);
ok(!q.paused(), 'a limit whose reset time has passed no longer holds the queue');

q = queueWith([]);
q.busy(true);
q.frame(rejected());
q.busy(false);
ok(!q.paused(), 'an empty queue has nothing to park');

q = queueWith(['next']);
q.frame(rejected());
q.busy(false, true);
ok(!q.paused(), 'the first value after a switch of conversation is no run\'s end');

/* Play pressed while the limit still holds: that is the person sending
   anyway. The next refused turn parks again. */
q = queueWith(['next', 'after']);
q.busy(true); q.frame(rejected()); q.busy(false);
q.play();
ok(q.badge().textContent === '', 'Play releases it, and the badge goes with the pause');
q.busy(true); q.busy(false);
ok(q.paused(), 'and a turn that ends while the limit still holds parks it again');

q = queueWith(['next']);
q.rehook();
q.frame(rejected());
ok(q.seen.length === 1, 'a second pass does not wrap the store twice');

console.log(fail ? fail + ' failed, ' + pass + ' passed' : pass + ' passed');
process.exit(fail ? 1 : 0);
