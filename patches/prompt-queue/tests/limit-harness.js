/* A queue wired the way drive.js wires it for usage limits, for limit.test.js
 * and limit-resume.test.js.
 *
 * The fragments that decide - model.js, schedule-lib.js, schedule-order.js,
 * session.js, usage-limit.js, limit-resume.js - run themselves, eval'd. What
 * is stubbed is only their outside world: the store (a plain object with the
 * app's processIncomingMessage), busy edges as __ccSession hands them out
 * (initial set on the first value), render(), the log, and the settings
 * dialog's store. */
const fs = require('fs'), path = require('path');
const QDIR = path.join(__dirname, '..', 'queue');
const NL = String.fromCharCode(10);
const FILES = ['schedule-lib.js', 'schedule-order.js', 'model.js', 'session.js', 'usage-limit.js', 'limit-resume.js'];
const SRC = FILES.map((f) => fs.readFileSync(path.join(QDIR, f), 'utf8')).join(NL);

const HOUR = 3600;
const frame = (info) => ({ type: 'rate_limit_event', rate_limit_info: info });
const rejected = (type, extra) => frame(Object.assign({ status: 'rejected', rateLimitType: type,
  resetsAt: Math.floor(Date.now() / 1000) + 2 * HOUR }, extra || {}));
const tick = () => new Promise((r) => setTimeout(r, 0));

function queueWith(items, settings) {
  let paused = false, idc = 100, editing = false, panel = null;
  const Q = items.map((t, i) => ({ id: i + 1, text: t, files: [], mode: 'queue' }));
  const busyFns = [], logs = [], seen = [];
  const render = () => {}, isBusy = () => false, ccLog = (...a) => { logs.push(a.join(' ')); };
  const el = (tag, cls) => ({ className: cls, textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  const store = { processIncomingMessage(m) { seen.push(m); } };
  const globalThis = { __ccStore: () => store };
  const window = {
    __ccSession: { on: (name, fn) => { if (name === 'busy') busyFns.push(fn); } },
    __ccSettings: settings === undefined ? undefined : { get: (n) => settings[n] }
  };
  eval(SRC + ';watchUsageLimit();hookRateLimit();');
  return {
    Q, logs, seen,
    frame: (m) => store.processIncomingMessage(m),
    busy: (v, initial) => busyFns.forEach((f) => f(v, store, !!initial)),
    run: (m) => { busyFns.forEach((f) => f(true, store, false)); if (m) store.processIncomingMessage(m); busyFns.forEach((f) => f(false, store, false)); },
    rehook: () => hookRateLimit(),
    paused: () => paused, pause: (v) => { paused = v; },
    badge: () => buildLimitBadge(),
    next: () => { const i = firstSendableIndex(); return i < 0 ? null : Q[i]; },
    veto: (it) => vetoResume(it),
    lane: () => laneItems()
  };
}

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };
const done = () => {
  console.log(fail ? fail + ' failed, ' + pass + ' passed' : pass + ' passed');
  process.exit(fail ? 1 : 0);
};

module.exports = { queueWith, frame, rejected, tick, ok, done, HOUR };
