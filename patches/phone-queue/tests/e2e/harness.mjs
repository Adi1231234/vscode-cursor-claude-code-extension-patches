/* What the e2e cases run on, whichever client sends the command and answers
 * the dialogs: the panel's own composer (run.mjs) or claude.ai over Remote
 * Control, the path the phone takes (phone.mjs). The queue and the replies are
 * always read in the lab panel; only `client` differs:
 *   send(cmd)   send a message           next()      the next dialog not yet
 *   answer(a)   tap a label / type a      close()     answered: {question,
 *               text into Other                       labels}, or null
 *   stop()      stop the running turn the way that client does */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, unwrap } from '../../../../tools/cdp/client.mjs';
import { claudePanels, panelContext } from '../../../../tools/cdp/panels.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

/* The lab's visible Claude panel, with page.js installed: ev runs in it. */
export async function labPanel(port) {
  const panel = (await claudePanels(port))[0];
  if (!panel) throw new Error('no Claude panel on port ' + port + ' - lab.mjs up first');
  const cdp = await connect(panel.target.webSocketDebuggerUrl);
  const contextId = await panelContext(cdp);
  const ev = async (expression) => unwrap(await cdp.send('Runtime.evaluate', {
    expression, contextId, returnByValue: true, awaitPromise: true, userGesture: true,
  }));
  await ev(fs.readFileSync(path.join(here, 'page.js'), 'utf8'));
  return { ev, close: () => cdp.close() };
}

export function makeT(ev, client) {
  const t = {
    ev,
    reset: (items) => ev('__e2e.reset(' + JSON.stringify(items || []) + ')'),
    queue: () => ev('__e2e.queue()'),
    play: () => ev('__qRemote.run({ op: "play" }).queue'),
    idle: () => ev('__e2e.idle()'),
    // true once the expression holds, null if it never does within ms.
    until: (expr, ms) => ev('__e2e.until(() => (' + expr + ') ? true : null, ' + ms + ')'),
    close: () => client.close(),
    stop: () => client.stop(),
    outputs: () => ev('__e2e.outputs().length'),
    // Send cmd, answer each screen in turn, return the screens and the reply.
    async flow(cmd, answers, { reply = true } = {}) {
      await t.idle();          // a command is not sent while a turn or a dialog is open
      const n = await t.outputs();
      await client.send(cmd);
      const screens = [];
      for (const a of answers) {
        const d = await client.next();
        if (!d) throw new Error('no dialog for answer ' + JSON.stringify(a) + ' after ' + screens.length + ' screen(s)');
        screens.push(d);
        if (a === t.CLOSE) await client.close(); else await client.answer(a);
      }
      const out = reply ? await ev('__e2e.outputAfter(' + n + ')') : null;
      if (reply && out == null) throw new Error('no reply printed for ' + cmd);
      return { screens, out };
    },
    CLOSE: { close: true },
  };
  return t;
}

/* Every case whose name holds filter - or one of its "|"-separated parts, to
   run a case together with the one before it - each reported as it ends.
   -> fail count */
export async function runCases(t, cases, filter) {
  let pass = 0, fail = 0;
  const failures = [], parts = filter.split('|');
  for (const c of cases.filter((x) => parts.some((p) => x.name.includes(p)))) {
    let checks;
    try {
      await t.idle();
      checks = await c.run(t);
    } catch (err) {
      checks = [[false, 'threw: ' + err.message]];
    }
    const bad = checks.filter(([okay]) => !okay);
    pass += checks.length - bad.length;
    fail += bad.length;
    console.log((bad.length ? '  FAIL ' : '  ok   ') + c.name + (bad.length ? ' - ' + bad.map((b) => b[1]).join('; ') : ''));
    if (bad.length) failures.push(c.name);
  }
  await t.reset([]);
  console.log(fail ? fail + ' failed, ' + pass + ' passed (' + failures.join(', ') + ')' : pass + ' passed');
  return fail;
}
