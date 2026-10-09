#!/usr/bin/env node
/* Do the patches slow the panel down? Measured, not guessed: the real panel
   (the published bundle, and the same bundle after apply.ps1) in a headless
   Chrome, opening the same long made-up conversation, idling, scrolling and
   streaming one Claude turn - every visit traced. Exits 1 when the patched
   panel goes over budgets.json. README.md has what each number means.

     node tools/perf/perf.mjs                    the version budgets.json pins
     node tools/perf/perf.mjs --version latest   the newest on OpenVSX
     node tools/perf/perf.mjs --ext <dir>        an extension apply.ps1 already
                                                 patched (it keeps *.pristine)
     --skip a,b   leave those patches out (apply.ps1 -Skip): what do they cost?
     --repo DIR   patch with another checkout's patches (an older commit)
     --rounds N   visits per variant (default: budgets.json)
     --json FILE  every number, for a CI artifact
     --report     never fail, only report */
import { appendFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from './chrome.mjs';
import { checkPhases, checkSelectors, medians, report } from './compare.mjs';
import { prepareExtension } from './prepare.mjs';
import { visit, warmUp } from './run.mjs';
import { startServer } from './serve.mjs';
import { budgets as readBudgets, panelData } from './data.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const budgets = readBudgets();
const log = (s) => console.log(`[perf] ${s}`);

/* Chrome starts while the extension is fetched and patched: neither waits on
   the other, and a cold Chrome took 4.6 s on a CI runner. */
const chromeStarting = launchChrome();
chromeStarting.catch(() => {}); // a failed start is reported where it is awaited
let prepared;
try {
  prepared = opt('--ext')
    ? { ext: resolve(opt('--ext')), version: '(given)', missed: [] }
    : await prepareExtension({ repo: opt('--repo') ? resolve(opt('--repo')) : REPO, log, skip: (opt('--skip') || '').split(',').filter(Boolean),
      version: opt('--version') === 'latest' ? undefined : opt('--version') || budgets.version });
} catch (e) {
  await chromeStarting.then((c) => c.close(), () => {});
  throw e;
}
log(`extension ${prepared.version} at ${prepared.ext}`);

const data = panelData(budgets.turns);
const rounds = Number(opt('--rounds') || budgets.rounds);
const server = await startServer({ ext: prepared.ext, data });
const chrome = await chromeStarting;
const base = { port: chrome.port, origin: server.origin, minRows: budgets.minRows };
const visits = { pristine: [], patched: [] };
const secs = (t) => `${((Date.now() - t) / 1000).toFixed(1)} s`;
let sel;
try {
  /* Not counted, so it is what carries the selector stats (run.mjs). */
  const t = Date.now();
  const s = await warmUp({ ...base, variants: ['pristine', 'patched'] });
  log(`warm-up and selector stats (not counted): ${secs(t)}`);
  sel = checkSelectors(s.pristine.selectorStats, s.patched.selectorStats, s.patched.styleElements, budgets.selectors);
  for (let r = 1; r <= rounds; r++) {
    /* Idle is checked once per variant: its limits are absolute caps, and 3 s
       of nothing is the same 3 s every round. */
    const phases = r === 1 ? ['mount', 'idle', 'scroll', 'stream'] : ['mount', 'scroll', 'stream'];
    for (const v of r % 2 ? ['pristine', 'patched'] : ['patched', 'pristine']) {
      const t = Date.now();
      visits[v].push(await visit({ ...base, variant: v, phases }));
      log(`round ${r} ${v}: open ${visits[v].at(-1).mount.busyMs} ms, stream ${visits[v].at(-1).stream.busyMs} ms busy; ${secs(t)}`);
    }
  }
} finally {
  await chrome.close();
  await server.close();
}

const m = { pristine: medians(visits.pristine), patched: medians(visits.patched) };
const phases = checkPhases(m.pristine, m.patched, budgets);
const text = report({ version: prepared.version, missed: prepared.missed, phases, selectors: sel });
console.log('\n' + text);
if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify({ version: prepared.version, medians: m, phases, selectors: sel, visits }, null, 1));

const over = phases.filter((r) => !r.ok).length + sel.bad.length;
const verdict = over ? `${over} over budget - see tools/perf/README.md` : 'within budget';
console.log(`\n${verdict}`);
/* On GitHub Actions the same report lands on the run's summary page. */
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Panel performance: ${verdict}\n\n\`\`\`\n${text}\n\`\`\`\n`);
process.exit(over && !argv.includes('--report') ? 1 : 0);
