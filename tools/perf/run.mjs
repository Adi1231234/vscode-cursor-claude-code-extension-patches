/* One measured visit of one panel variant, phase by phase, each in a trace of
   its own:

     mount   open the conversation and wait until it has stopped changing
     idle    3 s of nothing - a patch that polls shows up here
     scroll  the transcript scrolled up and back, a step a frame
     stream  a prompt sent the way a person sends it (typed, Enter), and the
             scripted turn (host/turn.js) streamed until its result

   A fresh tab each visit, so no visit inherits another's layout or caches.
   And the warm-up that comes first (warmUp), which carries the selector
   stats. */
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
/* wall: where the phase's own wall-clock time went - the page doing it, and
   collecting its trace - for keeping the whole run short. */
async function phase(tab, name, body, { deep } = {}) {
  const extra = deep && deep.phase === name ? deep.extra : [];
  const t0 = Date.now();
  const stop = await startTrace(tab.browserWs, { extra });
  const t1 = Date.now();
  const result = await body();
  const t2 = Date.now();
  const events = await stop();
  const m = summarize(events, tab.id, tab.pid);
  tab.pid = tab.pid || m.pid;
  if (extra.length) m.events = events;
  return { ...m, result, wall: { start: t1 - t0, body: t2 - t1, trace: Date.now() - t2, events: events.length } };
}

async function closeTab(port, tab) {
  tab.page.close();
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const browser = await connect(ver.webSocketDebuggerUrl);
  await browser.send('Target.closeTarget', { targetId: tab.id });
  browser.close();
}

/* Opens the conversation in the tab and waits until it has stopped changing. */
async function open(tab, origin, variant, minRows) {
  const loaded = new Promise((r) => tab.page.on('Page.loadEventFired', r));
  await tab.page.send('Page.navigate', { url: `${origin}/v/${variant}/panel.html` });
  await loaded;
  return evaluate(tab.page, script('settled.js', {
    __QUIET__: '500', __UNTIL__: `document.querySelectorAll('[data-transcript-message]').length >= ${minRows}` }));
}

/* The warm-up, which nothing counts, and Blink's selector stats. Every
   variant's conversation is opened, each in a tab of its own, and then one
   full style pass over each open page is traced with the stats on: every rule
   tried on every element it would be (scenarios/restyle-all.js). Tracing the
   stats over the whole opening instead - 300 style passes - made each
   warm-up 3-4x slower and its trace huge, and the start of the second such
   trace once took 10 s on a CI runner. Opened side by side, not one after the
   other: only counts come out of here, never times.
   -> { [variant]: { styleElements, selectorStats } } */
export async function warmUp({ port, origin, variants, minRows }) {
  const tabs = await Promise.all(variants.map(() => openTab(port, `${origin}/__host/blank.html`)));
  try {
    const opened = await Promise.all(tabs.map((tab, i) => open(tab, origin, variants[i], minRows)));
    opened.forEach((o, i) => { if (!o.ok) throw new Error(`${variants[i]}: the conversation did not render (${JSON.stringify(o)})`); });
    const stop = await startTrace(tabs[0].browserWs, { selectors: true });
    for (const tab of tabs) await evaluate(tab.page, script('restyle-all.js'));
    const events = await stop();
    return Object.fromEntries(variants.map((v, i) => {
      const m = summarize(events, tabs[i].id);
      return [v, { styleElements: m.styleElements, selectorStats: selectorStats(events.filter((e) => e.pid === m.pid)) }];
    }));
  } finally {
    await Promise.all(tabs.map((tab) => closeTab(port, tab)));
  }
}

/* setup: an expression run in the page once the conversation is open, before
   the other phases - why.mjs uses it to take rules out of the live sheet. */
export async function visit({ port, origin, variant, minRows, deep, setup, phases = ['mount', 'idle', 'scroll', 'stream'] }) {
  const tab = await openTab(port, `${origin}/__host/blank.html`);
  const out = {};
  try {
    out.mount = await phase(tab, 'mount', () => open(tab, origin, variant, minRows), { deep });
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
        return evaluate(tab.page, script('settled.js', { __QUIET__: '500', __UNTIL__: 'window.__perfTurnDone > 0' }));
      }, { deep });
      if (!out.stream.result.ok) throw new Error(`${variant}: the scripted turn never finished (${JSON.stringify(out.stream.result)})`);
    }
  } finally {
    await closeTab(port, tab);
  }
  return out;
}
