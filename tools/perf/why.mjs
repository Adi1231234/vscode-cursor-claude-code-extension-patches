#!/usr/bin/env node
/* Why is a phase over budget? Runs one visit of the patched panel with Blink's
   invalidation tracking on for that phase, and names the code behind the work:

     style passes   what scheduled them (the attribute / class / :has change
                    and the JS stack that made it), by patch
     forced         style or layout a script forced, by patch
     script         JS self time, by patch (see attribute.mjs for how a frame
                    is tied to a patch)

     node tools/perf/why.mjs --phase stream [--variant pristine]
       [--ext <patched dir> | --version 2.1.294] [--skip patch-a,patch-b] */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from './chrome.mjs';
import { blame, indexSource, owner, pageScripts } from './attribute.mjs';
import { prepareExtension } from './prepare.mjs';
import { visit } from './run.mjs';
import { startServer } from './serve.mjs';
import { budgets as readBudgets, panelData } from './data.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const here = dirname(fileURLToPath(import.meta.url));
const budgets = readBudgets();
const skip = (opt('--skip', '') || '').split(',').filter(Boolean);
const ext = opt('--ext') ? resolve(opt('--ext'))
  : (await prepareExtension({ repo: resolve(here, '..', '..'), skip, log: (s) => console.log(`[why] ${s}`),
    version: opt('--version') === 'latest' ? undefined : opt('--version') || budgets.version })).ext;
const phaseName = opt('--phase', 'stream');
const variant = opt('--variant', 'patched');

const server = await startServer({ ext, data: panelData(budgets.turns) });
const chrome = await launchChrome();
let m, html;
try {
  html = await (await fetch(`${server.origin}/v/${variant}/panel.html`)).text();
  const deep = { phase: phaseName, extra: ['disabled-by-default-devtools.timeline.invalidationTracking'] };
  const phases = ['mount', 'idle', 'scroll', 'stream'].slice(0, ['mount', 'idle', 'scroll', 'stream'].indexOf(phaseName) + 1);
  /* --drop <regex>: take every rule whose text matches out of the live sheet
     first - does the phase get its time back without them? */
  const drop = opt('--drop');
  const setup = drop && `(() => { const rx = new RegExp(${JSON.stringify(drop)}); let n = 0;
    for (const s of document.styleSheets) { let r; try { r = s.cssRules; } catch (e) { continue; }
      for (let i = r.length - 1; i >= 0; i--) if (rx.test(r[i].cssText)) { s.deleteRule(i); n++; } }
    return n; })()`;
  const v = await visit({ port: chrome.port, origin: server.origin, variant, minRows: budgets.minRows, deep, phases, setup });
  if (drop) console.log(`dropped ${v.setup} rule(s) matching /${drop}/`);
  m = v[phaseName];
  if (opt('--dump')) writeFileSync(opt('--dump'), JSON.stringify({ traceEvents: m.events }));
} finally { await chrome.close(); await server.close(); }

const scripts = pageScripts(html);
const idx = indexSource(readFileSync(join(ext, 'webview', variant === 'pristine' ? 'index.js.pristine' : 'index.js'), 'utf8'));
const count = (map, k, n = 1) => map.set(k, (map.get(k) || 0) + n);
const top = (map, unit = '') => [...map].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `  ${String(Math.round(n)).padStart(6)}${unit}  ${k}`).join('\n');

const sched = new Map(), forced = new Map(), js = new Map(), restyled = new Map(), sets = new Map();
const thread = m.events.filter((e) => e.ph === 'X' && e.name === 'FunctionCall');
const shortNode = (n) => String(n || '').replace(/_[A-Za-z0-9_-]{6}\b/g, '_').replace(/\s+/g, ' ').slice(0, 70);
for (const e of m.events) {
  const d = (e.args && (e.args.data || e.args.beginData)) || {};
  if (e.name === 'StyleRecalcInvalidationTracking') count(restyled, `${(d.reason && (d.reason.type || d.reason)) || '?'}: ${shortNode(d.nodeName)}`);
  if (e.name === 'StyleInvalidatorInvalidationTracking') {
    const list = (d.invalidationList || []).map((x) => [...(x.classes || []), ...(x.attributes || []), ...(x.ids || []), ...(x.tagNames || [])].join(',')).join(' | ');
    count(sets, `${d.reason || '?'}: ${shortNode(list || d.selectors && JSON.stringify(d.selectors))}`);
  }
  if (e.name === 'ScheduleStyleInvalidationTracking' || e.name === 'StyleRecalcInvalidationTracking') {
    const what = d.changedAttribute ? `attr ${d.changedAttribute}` : d.changedClass ? `class ${d.changedClass}` :
      d.changedPseudo ? `pseudo ${d.changedPseudo}` : (d.reason && (d.reason.type || d.reason)) || e.name;
    count(sched, `${String(what).slice(0, 40)} <- ${blame(d.stackTrace, scripts, idx)}`);
  }
  if ((e.name === 'Layout' || e.name === 'UpdateLayoutTree') && d.stackTrace && d.stackTrace.length) {
    count(forced, `${e.name} <- ${blame(d.stackTrace, scripts, idx)}`, e.dur / 1000);
  }
}
for (const e of thread) {
  const nested = thread.filter((x) => x !== e && x.pid === e.pid && x.tid === e.tid && x.ts >= e.ts && x.ts + x.dur <= e.ts + e.dur);
  const self = e.dur - nested.reduce((t, x) => t + x.dur, 0);
  count(js, owner(e.args.data || {}, scripts, idx), self / 1000);
}
const { events, result, ...summary } = m;
console.log(`${variant} ${phaseName}: ${JSON.stringify(summary)}\n`);
console.log(`style invalidations (count), by cause:\n${top(sched)}\n`);
console.log(`elements restyled (count), by reason and element:\n${top(restyled)}\n`);
console.log(`invalidation sets that fired (count):\n${top(sets)}\n`);
console.log(`forced style/layout (ms), by caller:\n${top(forced, 'ms')}\n`);
console.log(`script entry points (self ms), by owner:\n${top(js, 'ms')}`);
