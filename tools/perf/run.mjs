/* One measured visit of one panel variant, phase by phase, each in a trace of
   its own:

     mount   open the conversation and wait until it has stopped changing
     idle    3 s of nothing - a patch that polls shows up here
     scroll  the transcript scrolled up and back, a step a frame
     stream  a prompt sent the way a person sends it (typed, Enter), and the
             scripted turn (host/turn.js) streamed until its result

   A fresh tab each visit, so no visit inherits another's layout or caches. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, targets, unwrap } from '../cdp/client.mjs';
import { selectorStats, startTrace, summarize } from './trace.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CR = String.fromCharCode(13);
const script = (name, subs = {}) => Object.entries(subs)
  .reduce((s, [k, v]) => s.split(k).join(v), readFileSync(join(HERE, 'scenarios', name), 'utf8'));

async function openTab(port, url) {
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const browser = await connect(ver.webSocketDebuggerUrl);
  const { result } = await browser.send('Target.createTarget', { url });
  browser.close();
  const t = (await targets(port)).find((x) => x.id === result.targetId);
  const page = await connect(t.webSocketDebuggerUrl);
  await page.send('Page.enable');
  return { page, id: result.targetId, browserWs: ver.webSocketDebuggerUrl };
}

const evaluate = async (page, expression) =>
  unwrap(await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }));

/* deep: { phase, extra: [categories] } - that one phase is traced with the
   extra categories too and hands back its raw events (why.mjs). */
async function phase(tab, name, body, { selectors = false, deep } = {}) {
  const extra = deep && deep.phase === name ? deep.extra : [];
  const stop = await startTrace(tab.browserWs, { selectors, extra });
  const result = await body();
  const events = await stop();
  const m = summarize(events, tab.id, tab.pid);
  tab.pid = tab.pid || m.pid;
  if (selectors) m.selectorStats = selectorStats(events);
  if (extra.length) m.events = events;
  return { ...m, result };
}

/* setup: an expression run in the page once the conversation is open, before
   the other phases - why.mjs uses it to take rules out of the live sheet. */
export async function visit({ port, origin, variant, minRows, selectors = false, deep, setup, phases = ['mount', 'idle', 'scroll', 'stream'] }) {
  const pageUrl = `${origin}/v/${variant}/panel.html`;
  const tab = await openTab(port, `${origin}/__host/blank.html`);
  const out = {};
  try {
    const mounted = script('settled.js', { __QUIET__: '800', __UNTIL__: `document.querySelectorAll('[data-transcript-message]').length >= ${minRows}` });
    out.mount = await phase(tab, 'mount', async () => {
      const loaded = new Promise((r) => tab.page.on('Page.loadEventFired', r));
      await tab.page.send('Page.navigate', { url: pageUrl });
      await loaded;
      return evaluate(tab.page, mounted);
    }, { selectors, deep });
    if (!out.mount.result || !out.mount.result.ok) throw new Error(`${variant}: the conversation did not render (${JSON.stringify(out.mount.result)})`);
    if (setup) out.setup = await evaluate(tab.page, setup);
    if (phases.includes('idle')) out.idle = await phase(tab, 'idle', () => new Promise((r) => setTimeout(() => r({ ok: true }), 3000)), { deep });
    if (phases.includes('scroll')) out.scroll = await phase(tab, 'scroll', () => evaluate(tab.page, script('scroll.js')), { deep });
    if (phases.includes('stream')) {
      out.stream = await phase(tab, 'stream', async () => {
        if ((await evaluate(tab.page, script('focus-input.js'))) !== 'ok') throw new Error(`${variant}: no composer to type into`);
        await tab.page.send('Input.insertText', { text: 'Run the build check again and tell me what changed' });
        await new Promise((r) => setTimeout(r, 200));
        const key = { windowsVirtualKeyCode: 13, code: 'Enter', key: 'Enter' };
        await tab.page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key, text: CR });
        await tab.page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
        return evaluate(tab.page, script('settled.js', { __QUIET__: '800', __UNTIL__: 'window.__perfTurnDone > 0' }));
      }, { deep });
      if (!out.stream.result.ok) throw new Error(`${variant}: the scripted turn never finished (${JSON.stringify(out.stream.result)})`);
    }
  } finally {
    tab.page.close();
    const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const browser = await connect(ver.webSocketDebuggerUrl);
    await browser.send('Target.closeTarget', { targetId: tab.id });
    browser.close();
  }
  return out;
}
