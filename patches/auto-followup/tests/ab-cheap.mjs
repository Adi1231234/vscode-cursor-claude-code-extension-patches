/* Does the edit change what the responder asks someone to run?
 *
 *   BEFORE=<a samples.js from before the edit> node ab-cheap.mjs [runs]
 *
 * Written for one change - the paragraphs that tell perf-skeptic to ask for the
 * cheapest check that would still settle the question. Measured at 2 runs on
 * four moments where a long run was being proposed and a short one existed:
 *
 *   before   asked for a cheaper check 3/8, named what it costs 1/8
 *   after                              8/8                      7/8
 *
 *
 * Two arms, same moments, same model and effort: the responder as shipped, and
 * the responder with the cheap-check paragraphs. Every answer is printed, and
 * the label beside it is a judge's opinion, not a regex - a classifier that
 * cannot see the difference is indistinguishable from an edit that made none.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { sample } from './sampler.mjs';

const here = dirname(fileURLToPath(import.meta.url));
globalThis.require = createRequire(import.meta.url);
for (const f of ['sections.js','format.js','store.js','samples.js','prompt.js','run.js','handle.js'])
  (0, eval)(readFileSync(join(here, '..', 'host', f), 'utf8'));
const F = globalThis.__ccAfFormat, R = globalThis.__ccAfRun, P = globalThis.__ccAfPrompt;

const NEW = globalThis.__ccAfSamples.find(s => s.id === 'perf-skeptic').text;
globalThis.__ccAfSamples = null;
(0, eval)(readFileSync(process.env.BEFORE, 'utf8').replace('globalThis.__ccAfSamples || ', ''));
const OLD = globalThis.__ccAfSamples.find(s => s.id === 'perf-skeptic').text;

const arms = { before: F.parse('p', OLD), after: F.parse('p', NEW) };
for (const a of Object.values(arms)) a.context = 'last-message';

const MOMENTS = [
  'The kernel is bit-identical. I will run the full 5097-shape suite overnight to confirm it before we ship.',
  'Prompt processing went from 28.0 s to 21.8 s. To know if it really helped I will benchmark token generation for twenty minutes, three arms, to get one decimal.',
  'I think register spill is what bounds this kernel. I will build both variants and measure them end to end on the full corpus.',
  'The q6_K path is faster. Next I will sweep all four block sizes across the whole visit corpus so we have the complete picture.'
];
const items = MOMENTS.map(text => ({ ctx: { text, cwd: tmpdir(), claims: [], asked: [],
                                            once: null, needFirst: false } }));
const RUNS = Number(process.argv[2]) || 2;

async function judge(moment, answer) {
  const prompt = [
    'You are scoring one follow-up question a reviewer sent a developer.',
    '',
    'The developer wrote:', moment, '',
    'The reviewer replied:', answer, '',
    'Answer with JSON only: {"asked_for_a_cheaper_check": true|false, "named_a_cost": true|false, "why": "<12 words>"}',
    '',
    'asked_for_a_cheaper_check is true only if the reply steers the developer to a',
    'shorter, smaller or already-available check instead of the long run they',
    'proposed - a counter, one case instead of a sweep, an existing artifact, the',
    'smallest input that would settle it. Asking a good question without touching',
    'the cost of the check is false.',
    'named_a_cost is true if the reply says what a check would cost in time.'
  ].join('\n');
  const out = await new Promise((res) => {
    const c = spawn('claude', ['-p', '--model', 'haiku', '--effort', 'low'],
                    { cwd: tmpdir(), shell: process.platform === 'win32', windowsHide: true });
    let s = ''; c.stdout.on('data', d => s += d); c.stderr.on('data', () => {});
    c.on('close', () => res(s));
    c.stdin.end(prompt);
  });
  const m = out.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m[0]); } catch { return { asked_for_a_cheaper_check: null, why: out.slice(0, 40) }; }
}

const table = {};
for (const [name, resp] of Object.entries(arms)) {
  console.log('\n===== ' + name + ' =====');
  const res = await sample(R, P, resp, items, RUNS, {
    plan: p => console.error(`  ${p.total} samples: ${p.reused} cached, ${p.calls} to run`),
    tick: r => process.stderr.write(r.error ? '!' : '.')
  });
  let cheap = 0, cost = 0, n = 0;
  for (let i = 0; i < MOMENTS.length; i++) {
    console.log('\n  moment ' + (i + 1) + ': ' + MOMENTS[i].slice(0, 76) + '...');
    for (const r of res[i]) {
      const text = (r.message || '') + ' ' + (r.why || '');
      const v = await judge(MOMENTS[i], text.trim());
      n++; if (v.asked_for_a_cheaper_check) cheap++; if (v.named_a_cost) cost++;
      console.log('    [' + (v.asked_for_a_cheaper_check ? 'CHEAPER' : '   -   ') + ']'
        + (v.named_a_cost ? '[cost]' : '      ') + ' ' + String(r.message || '').replace(/\s+/g, ' ').slice(0, 150));
    }
  }
  table[name] = { cheaper: cheap + '/' + n, namedACost: cost + '/' + n };
}
console.log('\n' + JSON.stringify(table, null, 1));
