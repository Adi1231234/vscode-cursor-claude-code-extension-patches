/* The whole chain in one run: the panel asks, the real CLI answers, the panel
 * shows it.
 *
 *   node patches/auto-followup/tests/e2e/live-e2e.mjs
 *
 * Everything else proves one half. host-run.test.js proves the runner turns
 * NDJSON into deltas; ui.test.js proves the live view renders deltas that the
 * test posted by hand. Neither says the messages one side sends are the
 * messages the other side understands - and that is exactly where the two bugs
 * were: the module was __ccAf and the harness called __ccAfHandle, and handle
 * takes the message first while the harness passed the webview first. Both
 * looked like a model that produced nothing.
 *
 * So: real host modules, a real spawn of the CLI, and the real panel script,
 * with only postMessage faked. It costs one live model call of about 20-30
 * seconds, which is why it is not in run-all.mjs.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const tests = join(here, '..');
const patch = join(tests, '..');
const root = join(patch, '..', '..');
const require = createRequire(import.meta.url);
globalThis.require = require;

for (const f of ['format.js', 'store.js', 'samples.js', 'prompt.js', 'run.js', 'handle.js'])
  (0, eval)(readFileSync(join(patch, 'host', f), 'utf8'));
globalThis.__ccAfStore.seedIfEmpty(globalThis.__ccAfSamples);

/* dom-stubs replaces setInterval with a capture of the panel's tick, and makes
   setTimeout run its callback at once. The second one matters here: run.js arms
   a timeout that kills the child, so under the stub the CLI is killed in the
   same breath it is spawned, and the failure arrives as "the responder returned
   nothing" - a silent model, not a killed one. Hold the real timers. */
const realInterval = setInterval, realClear = clearInterval, realTimeout = setTimeout;
require(join(tests, 'dom-stubs.js'));
globalThis.setTimeout = realTimeout;

const T = require(join(tests, 'load-panel.js')).loadPanel(
  '{arm:arm,maybeRun:maybeRun,openLive:openLive,' +
  'state:()=>({slot:slot,pending:pending,turns:turns})}');

/* Arm the shipped responder, put a fresh assistant reply on screen, and let the
   panel decide to answer it. Asking the host directly would skip requestRun,
   which is what sets the id the panel matches the result against. */
globalThis.__onMsg({ data: { type: '__ccaf', op: 'list',
  items: [globalThis.__ccAfStore.read('perf-skeptic')] } });
T.arm('perf-skeptic');
globalThis.__msgs = [{ role: 'user', content: 'go' }, { role: 'assistant', content:
  'The q6_K GEMM landed: prompt processing 28.0 s to 21.8 s, +27%, output byte-identical.' }];
T.maybeRun();

const ask = globalThis.sent.filter((m) => m.op === 'run').pop();
if (!ask) { console.log('FAIL: the panel never asked for a run'); process.exit(1); }
T.openLive();

/* The stub's workspace root is a fabricated path and nothing can spawn into it.
   cwd is environment, not protocol, so it is the one field supplied here. */
ask.ctx.cwd = tmpdir();

const posted = [];
const webview = { postMessage: (m) => { posted.push({ ...m, at: Date.now() });
                                        globalThis.__onMsg({ data: m }); } };
const t0 = Date.now();
if (!globalThis.__ccAf.handle({ type: '__ccaf', op: 'run', rid: ask.rid,
                                id: ask.id, ctx: ask.ctx }, webview)) {
  console.log('FAIL: the host refused the message the panel sent');
  process.exit(1);
}

await new Promise((res) => {
  const iv = realInterval(() => {
    if (posted.some((m) => m.op === 'result') || Date.now() - t0 > 180000) {
      realClear(iv); res();
    }
  }, 200);
});

const result = posted.find((m) => m.op === 'result');
const chunks = posted.filter((m) => m.op === 'chunk');
const streamed = chunks.filter((c) => c.kind === 'text').map((c) => c.text).join('');
const rendered = [...document.querySelectorAll('.__afSeg')]
  .filter((s) => s.querySelector('.__afSegTag').textContent === 'output')
  .map((s) => s.querySelector('.__afSegText').textContent).join('');

const before = (document.querySelector('.__afLiveState') || {}).textContent;
/* The live view owns a one-second timer whose only job is renderLive, and the
   stub captured it rather than running it. Running it once is the product's
   timer, not a repaint invented here. */
try { globalThis.__tick(); } catch (e) {}
const after = (document.querySelector('.__afLiveState') || {}).textContent;

const st = T.state();
const lane = document.querySelector('.__afText');
const checks = [
  ['the host accepted the panel id and answered it', result && result.rid === ask.rid],
  ['the run produced no error', result && !result.error],
  ['the CLI streamed something', streamed.length > 0],
  ['every streamed character reached the screen', streamed.length > 0 && rendered === streamed],
  ['the counter shows the characters it rendered',
   (document.querySelector('.__afLiveCount') || {}).textContent.indexOf(streamed.length + ' chars') === 0],
  ['the header says writing while it writes', before === 'writing'],
  ['and stops saying it when the answer lands', after !== 'writing'],
  ['the result became a slot', !!(st.slot && st.slot.message)],
  ['the slot text is text that was streamed',
   !!(st.slot && streamed.indexOf(st.slot.message.slice(0, 25)) >= 0)],
  ['the lane shows it', !!lane && lane.textContent === (st.slot || {}).message],
  ['the turn was counted', st.turns === 1],
];

let bad = 0;
for (const [name, ok] of checks) { if (!ok) bad++; console.log((ok ? '  ok   ' : '  FAIL ') + name); }
console.log('  ' + chunks.length + ' chunks, ' + streamed.length + ' chars, first after '
  + (chunks.length ? chunks[0].at - t0 : '-') + 'ms, ' + (Date.now() - t0) + 'ms total');
console.log('  kinds streamed: ' + [...new Set(chunks.map((c) => c.kind))].join(', '));
console.log(bad ? '  ' + bad + ' failed' : '  all ' + checks.length + ' passed');
process.exit(bad ? 1 : 0);
