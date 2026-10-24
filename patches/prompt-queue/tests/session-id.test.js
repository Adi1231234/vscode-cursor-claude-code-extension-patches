/* The queue follows the conversation on screen (persist.js + session-id.js,
 * eval'd with only what they reach out to stubbed):
 *   - a page with no conversation yet (the desktop "New session" page) starts
 *     empty, and the queue it left stays saved under its own conversation;
 *   - what is queued there is adopted by the conversation the page becomes;
 *   - going back restores a conversation's queue, held. */
const fs = require('fs'), path = require('path');
const DIR = path.resolve(__dirname, '..', 'queue');
const NL = String.fromCharCode(10);

let bad = 0;
function ok(cond, msg) { if (cond) console.log('  ok   ' + msg); else { bad++; console.log('  FAIL ' + msg); } }

const mem = {};
const localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; }
};
const location = { href: 'https://claude.ai/code' };
let Q = [], idc = 0, paused = false, collapsed = false, sid = null;
const store = () => (sid ? { sessionId: sid } : null);
const getSession = store, inp = () => null, qs = () => null, fiberOf = () => null;
const render = () => {}, ccLog = () => {};
const isScheduled = (it) => !!(it.mode && it.mode !== 'queue');
const isParked = (it) => !!it.off;
eval(['persist.js', 'session-id.js'].map((f) => fs.readFileSync(path.join(DIR, f), 'utf8')).join(NL));

const add = (t) => Q.push({ id: ++idc, text: t, files: [], mode: 'queue' });
const texts = () => Q.map((it) => it.text).join(',');

sid = 'A'; syncSession();
add('a1'); add('a2'); saveQueue();
ok(texts() === 'a1,a2', 'conversation A holds its two items');

sid = null; syncSession();
ok(Q.length === 0, 'the New page starts with an empty queue, not A\'s');
ok(JSON.parse(mem['ccq:A']).items.length === 2, 'A\'s queue stays saved under A');

add('n1');
sid = 'B'; syncSession();
ok(texts() === 'n1', 'what was queued on the New page is adopted by the conversation it became');
ok(JSON.parse(mem['ccq:B']).items[0].t === 'n1', 'and saved under it');

sid = 'A'; syncSession();
ok(texts() === 'a1,a2', 'going back to A restores its queue');
ok(paused === true, 'restored held, so nothing fires on its own');

sid = 'A'; syncSession();
ok(texts() === 'a1,a2', 'the same id again changes nothing');

if (bad) { console.log(bad + ' failed'); process.exit(1); }
console.log('session-id: all passed');
