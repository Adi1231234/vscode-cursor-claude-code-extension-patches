/* The e2e cases over Remote Control - the path the phone takes - with no phone:
 *
 *     node patches/phone-queue/tests/e2e/phone.mjs [--port 9556] [--chrome 9225] [name-filter[|another]]
 *
 * The lab tab's conversation gets Remote Control turned on, its claude.ai link
 * is opened in a background tab of a Chrome that is logged in to claude.ai
 * (--chrome: its remote-debugging port), and every case of run.mjs is sent and
 * answered from that page - over the same bridge, with the same question card
 * and the same Skip / X answers as the Claude app (web.js). The queue and the
 * replies are read in the lab panel as before. At the end the page is closed
 * and Remote Control turned off again.
 *
 * Use a lab nobody holds on a phone (a second one: lab.mjs up --port 9556), and
 * a tab where /queue answers - a fresh lab's first tab may not have the mod. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, unwrap } from '../../../../tools/cdp/client.mjs';
import { labPanel, makeT, runCases } from './harness.mjs';
import { MENU } from './cases-menu.mjs';
import { MORE } from './cases-more.mjs';
import { TYPED } from './cases-typed.mjs';
import { STOPS } from './cases-stop.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, dflt) => +(args[args.indexOf(name) + 1] || 0) || dflt;
const port = opt('--port', 9556), chromePort = opt('--chrome', 9225);
const filter = args.find((a) => !a.startsWith('--') && !/^[0-9]+$/.test(a)) || '';

const lab = await labPanel(port);
const { ev } = lab;
const RC = '(async () => { const s = __ccStore(); const want = __WANT__;' +
  ' if ((s.remoteControlState.value.status === "connected") !== want) await s.toggleRemoteControl();' +
  ' await __e2e.until(() => (s.remoteControlState.value.status === "connected") === want ? true : null, 30000);' +
  ' return s.remoteControlState.value; })()';
const before = await ev('__ccStore().remoteControlState.value.status');
if (before === 'connected' || before === 'connecting') {
  console.log('Remote Control is already on in this tab - someone may be using it. Open a new tab and run again.');
  process.exit(2);
}
const state = await ev(RC.replace('__WANT__', 'true'));
if (!state.sessionUrl) { console.log('Remote Control did not connect: ' + JSON.stringify(state)); process.exit(2); }

/* A background tab in that Chrome, on the session's page. */
const version = await (await fetch('http://127.0.0.1:' + chromePort + '/json/version')).json();
const browser = await connect(version.webSocketDebuggerUrl);
const { targetId } = (await browser.send('Target.createTarget', { url: state.sessionUrl, background: true })).result;
const pageInfo = (await (await fetch('http://127.0.0.1:' + chromePort + '/json/list')).json()).find((x) => x.id === targetId);
const page = await connect(pageInfo.webSocketDebuggerUrl);
const wev = async (expression) => unwrap(await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }));
await page.send('Page.enable');
await wev('new Promise((r) => { const ok = () => document.querySelector("[contenteditable=true][aria-label=Prompt]"); if (ok()) return r(1);' +
  ' const mo = new MutationObserver(() => { if (ok()) { mo.disconnect(); r(1); } }); mo.observe(document, { subtree: true, childList: true }); setTimeout(() => r(0), 30000); })');
await wev(fs.readFileSync(path.join(here, 'web.js'), 'utf8'));
await ev('__e2e.closeAll()');

const webClient = {
  async send(cmd) {
    const r = await wev('__rc.send(' + JSON.stringify(cmd) + ')');
    if (r !== 'sent') throw new Error('claude.ai did not send ' + cmd + ': ' + r);
  },
  next: () => wev('__rc.next()'),
  answer: (a) => wev('__rc.answer(' + JSON.stringify(a) + ')'),
  close: () => wev('__rc.x()'),
  stop: () => wev('__rc.stop()'),
};

let fail = 1;
try {
  console.log('  over Remote Control: ' + state.sessionUrl);
  fail = await runCases(makeT(ev, webClient), [...MENU, ...MORE, ...TYPED, ...STOPS], filter);
} finally {
  await browser.send('Target.closeTarget', { targetId });
  await ev(RC.replace('__WANT__', 'false'));
  page.close(); browser.close(); lab.close();
}
process.exit(fail ? 1 : 0);
