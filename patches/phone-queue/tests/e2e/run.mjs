/* Every /queue button and command, for real, in the lab editor.
 *
 *     node tools/lab/lab.mjs up --version 2.1.287      (once)
 *     node patches/phone-queue/tests/e2e/run.mjs [--port 9555] [name-filter[|another]]
 *
 * Each case puts the queue in a known state, sends a /queue command from the
 * panel's composer, answers every dialog the way a person would (tap a button,
 * or type into Other), and then checks the queue itself and the reply. The
 * unit suites pin the logic against a scripted io; this pins that the real
 * engine draws the dialogs, takes the taps, and that the panel's queue moves.
 * The same cases over Remote Control, the phone's path: phone.mjs.
 *
 * Cases that send (Play, Send now, /queue now) start a real Claude turn - the
 * lab may run real conversations - and wait for it to finish. */
import { sendPrompt } from '../../../../tools/lab/drive.mjs';
import { labPanel, makeT, runCases } from './harness.mjs';
import { MENU } from './cases-menu.mjs';
import { MORE } from './cases-more.mjs';
import { TYPED } from './cases-typed.mjs';
import { STOPS } from './cases-stop.mjs';

const args = process.argv.slice(2);
const port = +(args[args.indexOf('--port') + 1] || 0) || 9555;
const filter = args.find((a) => !a.startsWith('--') && !/^[0-9]+$/.test(a)) || '';

const lab = await labPanel(port);
const { ev } = lab;
/* Never in a conversation someone may be holding on a phone. On 2026-10-04 a
   run in the Remote Control session Adi was using closed their dialogs and
   sent ~80 commands under their thumb, which read as the menu looping. Open a
   new conversation for this (Claude Code: Open in New Tab) instead. */
const rc = await ev('(() => { const s = globalThis.__ccStore && globalThis.__ccStore(); return s ? s.remoteControlState.value.status : "no store"; })()');
if (rc === 'connected' || rc === 'connecting') {
  console.log('Remote Control is ' + rc + ' in this conversation - someone may be using it from a phone.');
  console.log('Open a new conversation in the lab (Claude Code: Open in New Tab) and run again.');
  lab.close();
  process.exit(2);
}
await ev('__e2e.closeAll()');

/* The panel's own composer and dialog. */
const panelClient = {
  async send(cmd) {
    const sent = await sendPrompt(port, cmd);
    if (!sent.sent) throw new Error('the composer did not send ' + cmd);
  },
  next: () => ev('__e2e.next()'),
  answer: (a) => ev('__e2e.answer(' + JSON.stringify(a) + ')'),
  close: () => ev('(() => { const d = __e2e.dialog(); d.root.querySelector("[aria-label=Close]").click(); return "ok" })()'),
  // What a phone's Stop reaches: the CLI, past this panel's interrupt().
  stop: () => ev('(() => { const s = __ccStore(); s.connection.value.interruptClaude(s.claudeChannelId); return "sent"; })()'),
};

const fail = await runCases(makeT(ev, panelClient), [...MENU, ...MORE, ...TYPED, ...STOPS], filter);
lab.close();
process.exit(fail ? 1 : 0);
