/* The host's end of /queue, against host/panels.js + host/server.js themselves.
 *
 *     node patches/phone-queue/tests/server.test.js
 *
 * Loaded the way patch.ps1 writes it (the __MODDIR__ placeholder filled) into a
 * fresh context with the host's require; the panels are fakes that record what
 * they are posted and answer through handle(), as webview/link.js does. Real
 * HTTP on 127.0.0.1, so the key in the path and the 404 are tested for real.
 *
 * Pinned: a command reaches the panel that spawned the asking CLI and no other,
 * with no claim needed first (a new conversation's first /queue); a CLI from
 * before the patch, a closed panel and a silent one are answers, not hangs; and
 * nothing but a POST to the keyed path is served. */
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), http = require('http');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };

const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccphone-'));
const host = (name) => fs.readFileSync(path.join(__dirname, '..', 'host', name), 'utf8');
const src = [host('panels.js'), host('server.js')].join(String.fromCharCode(10))
  .replace('__MODDIR__', 'patches-mods/phone-queue')
  .replace('var REPLY_MS = 5000;', 'var REPLY_MS = 300;');
const ctx = { require, __dirname: extDir, setTimeout, clearTimeout, console, WeakRef, Promise };
ctx.globalThis = ctx;
vm.runInNewContext(src, ctx);
const phone = ctx.__ccPhone;

function post(url, body, raw) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: { 'content-type': 'application/json' } }, (res) => {
      let t = '';
      res.on('data', (c) => { t += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: t ? JSON.parse(t) : null }));
    });
    req.end(raw || JSON.stringify(body));
  });
}

/* A panel's webview: records posts, and answers a run the way link.js does.
   A closed one resolves false, as VS Code's ExtHostWebview does - it does not
   throw (read in three VS Code builds and in Cursor). */
function panel(name, answer, from) {
  const wv = { name, posted: [], postMessage(m) {
    if (wv.dead) return Promise.resolve(false);
    wv.posted.push(m);
    if (m.op === 'run' && answer) setImmediate(() => phone.handle({ type: '__ccphone', op: 'result', id: m.id, result: answer(m) }, from || wv));
    return Promise.resolve(true);
  } };
  return wv;
}

(async () => {
  ok(await phone.ready === true, 'ready settles once it listens');
  const url = phone.env().CC_PHONE_QUEUE_URL;
  ok(/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{36}$/.test(url), 'listens on 127.0.0.1, keyed by a random path');

  ok(JSON.stringify(phone.args()) === '{}', 'no --plugin-dir while the mod folder is missing');
  fs.mkdirSync(path.join(extDir, 'patches-mods', 'phone-queue'), { recursive: true });
  ok(phone.args()['plugin-dir'] === path.join(extDir, 'patches-mods', 'phone-queue'), '--plugin-dir once it is there');

  const wrong = await post(url.replace(/[0-9a-f]{36}$/, 'f'.repeat(36)), { sid: 's', cmd: { op: 'list' } });
  ok(wrong.status === 404, 'the wrong key is a 404');

  /* Each spawn gets its panel's token; a respawn from the same panel reuses it. */
  const a = panel('a', (m) => ({ error: '', queue: { from: 'a', op: m.cmd.op, sid: m.sid } }));
  const b = panel('b', (m) => ({ error: '', queue: { from: 'b' } }));
  const ta = phone.env(a).CC_PHONE_QUEUE_PANEL, tb = phone.env(b).CC_PHONE_QUEUE_PANEL;
  ok(/^[0-9a-f]{24}$/.test(ta) && ta !== tb, 'a token per panel');
  ok(phone.env(a).CC_PHONE_QUEUE_PANEL === ta, 'the same panel spawning again gets the same token');
  ok(phone.env({}).CC_PHONE_QUEUE_PANEL === '' && phone.env().CC_PHONE_QUEUE_URL === url,
    'a spawn with no webview still sets both keys, the token empty: an inherited one must not survive');

  let r = await post(url, { panel: ta, sid: 'NEW', cmd: { op: 'pause' } });
  ok(r.body.queue.from === 'a' && b.posted.length === 0, 'the command reaches the panel that spawned the CLI, and only it');
  ok(r.body.queue.sid === 'NEW' && r.body.queue.op === 'pause', 'with no claim first - the first /queue of a new conversation');

  r = await post(url, { sid: 'S', cmd: { op: 'list' } });
  ok(/before the phone-queue patch/.test(r.body.error), 'a CLI spawned before the patch is told to restart');
  r = await post(url, { panel: 'f'.repeat(24), sid: 'S', cmd: { op: 'list' } });
  ok(/is gone/.test(r.body.error), 'an unknown token is an answer, not a hang');

  const mute = panel('mute', null);
  r = await post(url, { panel: phone.env(mute).CC_PHONE_QUEUE_PANEL, sid: 'S', cmd: { op: 'list' } });
  ok(/may still have done it/.test(r.body.error), 'a panel that never answers times out, and does not claim nothing happened');

  const other = panel('other', null);
  const imposter = panel('imposter', () => ({ error: '', queue: { from: 'imposter' } }), other);
  r = await post(url, { panel: phone.env(imposter).CC_PHONE_QUEUE_PANEL, sid: 'S', cmd: { op: 'list' } });
  ok(/may still have done it/.test(r.body.error), 'an answer from another webview than the one asked does not count');

  r = await post(url, null, JSON.stringify({ panel: ta, sid: 'S', cmd: { op: 'add', text: 'x'.repeat(70000) } }));
  ok(r.status === 413 && /too long/.test(r.body.error) && a.posted.length === 1, 'an oversize command is refused with a reason, and never posted');

  const gone = panel('gone', () => ({}));
  const tg = phone.env(gone).CC_PHONE_QUEUE_PANEL;
  gone.dead = true;
  r = await post(url, { panel: tg, sid: 'S', cmd: { op: 'list' } });
  ok(/closed/.test(r.body.error), 'a disposed panel is reported as closed');
  r = await post(url, { panel: tg, sid: 'S', cmd: { op: 'list' } });
  ok(/is gone/.test(r.body.error), 'and forgotten');

  ok(phone.handle({ type: 'other' }) === false, 'messages that are not ours are left to the app');
  r = await post(url, { nonsense: true });
  ok(/not a \/queue request/.test(r.body.error), 'a malformed body is refused');

  console.log(fail ? fail + ' failed, ' + pass + ' passed' : pass + ' passed');
  process.exit(fail ? 1 : 0);
})();
