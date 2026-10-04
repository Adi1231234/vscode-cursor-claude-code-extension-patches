/* The queue's phone surface, eval'd for a test: the real schedule-lib.js +
 * schedule-order.js + model.js + remote-item.js + remote-api.js, with only what
 * those fragments reach out to stubbed. Shared by remote.test.js and
 * remote-item.test.js. */
const fs = require('fs'), path = require('path');
const DIR = path.resolve(__dirname, '..', 'queue');
const NL = String.fromCharCode(10);

function makeQueue(items) {
  const Q = items || [];
  let idc = 100, paused = false, editing = false, busy = false, flushing = false, panel = null;
  let renders = 0, flushes = 0;
  const sentNow = [];
  const render = () => { renders++; };
  const flush = () => { flushes++; };
  const isBusy = () => busy;
  const ccLog = () => {};
  let _curSid = null, syncs = 0;
  const syncSession = () => { syncs++; _curSid = 'sid-1'; };   /* persist.js: the id, read now */
  const window = {};
  const sendBlocked = (it) => (it.off ? 'Skipped - enable it first' : '');
  const sendNow = (it) => { sentNow.push(it); Q.splice(Q.indexOf(it), 1); };
  const restartRunMark = () => {};   /* stop-pause.js, pinned in stops.test.js */
  const src = ['schedule-lib.js', 'schedule-order.js', 'model.js', 'remote-item.js', 'remote-api.js']
    .map((f) => fs.readFileSync(path.join(DIR, f), 'utf8')).join(NL);
  eval(src);
  return {
    Q, run: window.__qRemote.run, sid: window.__qRemote.sid, sentNow,
    paused: () => paused, flushes: () => flushes,
    setBusy: (v) => { busy = v; }
  };
}

const MIN = 60000;
const item = (text, extra) => Object.assign({ id: text, text: text, mode: 'queue' }, extra || {});
const floating = (text, at) => item(text, { mode: 'time', at: at, start: Date.now(), dur: MIN, hold: false });

module.exports = { makeQueue, item, floating, MIN };
