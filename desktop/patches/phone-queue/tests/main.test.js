/* The desktop main process's end of /queue, against the real
 * patches/phone-queue/host/listen.js + main/router.js + main/start.js, with
 * only Electron stood in for: every CLI the app starts gets the mod and the
 * address, and a command POSTed the way the mod does reaches the Code tab page
 * that shows the conversation, and nothing else.
 *
 *     node desktop/patches/phone-queue/tests/main.test.js */
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { EventEmitter } = require('events');
const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const NL = String.fromCharCode(10);

let bad = 0;
function ok(cond, msg) { if (cond) console.log('  ok   ' + msg); else { bad++; console.log('  FAIL ' + msg); } }

const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'ccd-phone-'));
const modDir = path.join(appData, 'claude-code-patches', 'mods', 'queue');
fs.mkdirSync(path.join(modDir, '.claude-plugin'), { recursive: true });
fs.writeFileSync(path.join(modDir, '.claude-plugin', 'plugin.json'), '{"name":"queue"}');

const ipcMain = new EventEmitter();
function page(handler) {   /* a Code tab page with our preload: hello, then answers */
    const wc = new EventEmitter();
    wc.isDestroyed = () => false;
    wc.send = (ch, m) => setImmediate(() => ipcMain.emit('ccd-phone-answer', { sender: wc }, handler(m)));
    ipcMain.emit('ccd-phone-hello', { sender: wc });
    return wc;
}
const fakeProcess = { type: 'browser', env: { LOCALAPPDATA: appData, CLAUDE_CODE_PLUGIN_DIRS: 'C:\\other' } };
const fakeRequire = (m) => (m === 'electron' ? { ipcMain } : require(m));
const src = ['patches/phone-queue/host/listen.js', 'desktop/patches/phone-queue/main/router.js', 'desktop/patches/phone-queue/main/start.js']
    .map((f) => fs.readFileSync(path.join(REPO, f), 'utf8')).join(NL);
new Function('process', 'require', src)(fakeProcess, fakeRequire);

function post(url, body) {
    return new Promise((resolve, reject) => {
        const req = http.request(url, { method: 'POST' }, (res) => {
            let d = ''; res.setEncoding('utf8'); res.on('data', (c) => { d += c; }); res.on('end', () => resolve(JSON.parse(d)));
        });
        req.on('error', reject); req.end(JSON.stringify(body));
    });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const dirs = fakeProcess.env.CLAUDE_CODE_PLUGIN_DIRS.split(path.delimiter);
    ok(dirs.includes(modDir) && dirs.includes('C:\\other'), 'the mod folder joins CLAUDE_CODE_PLUGIN_DIRS, keeping what was there');
    ok(fakeProcess.env.CC_PHONE_QUEUE_PANEL === '', 'no panel token: the app routes by conversation');
    await wait(100);
    const url = fakeProcess.env.CC_PHONE_QUEUE_URL;
    ok(/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{36}$/.test(url), 'the listener address is in the environment once it listens');

    let r = await post(url, { panel: '', sid: 'cli-1', cmd: { op: 'list' } });
    ok(/no Code tab open/.test(r.error), 'no page yet: says so');

    const seen = [];
    page((m) => ({ id: m.id }));   /* does not know the conversation */
    page((m) => { seen.push(m); return m.sid === 'cli-1' ? { id: m.id, result: { error: '', queue: { lane: [] } } } : { id: m.id }; });
    r = await post(url, { panel: '', sid: 'cli-1', cmd: { op: 'list' } });
    ok(r.error === '' && r.queue, 'the page showing the conversation answers, and the CLI gets its answer');
    ok(seen[0] && seen[0].cmd.op === 'list', 'the command reaches the page as sent');

    r = await post(url, { panel: '', sid: 'cli-9', cmd: { op: 'list' } });
    ok(/does not know this conversation/.test(r.error), 'no page has it: the phone is told to open it in the app');

    const stranger = new EventEmitter();
    const late = post(url, { panel: '', sid: 'cli-2', cmd: { op: 'pause' } });
    await wait(20);
    ipcMain.emit('ccd-phone-answer', { sender: stranger }, { id: 99, result: { error: 'forged' } });
    r = await late;
    ok(r.error !== 'forged', 'an answer from a page that was not asked is ignored');

    r = await post(url, { sid: 5, cmd: {} });
    ok(r.error === 'not a /queue request', 'a malformed request is refused');

    fs.rmSync(appData, { recursive: true, force: true });
    if (bad) { console.log(bad + ' failed'); process.exit(1); }
    console.log('phone-queue main: all passed');
    process.exit(0);
})();
