/* Which rules fire reliably, and which are a coin flip.
 *
 *   node reliability.mjs <moments.json> [runs] [from] [count]
 *
 * The frame question was measured once and turned out to fire 3 times in 6 on the
 * message where it mattered most. Every other rule has never been measured at all.
 * A rule that fires sometimes is not a rule, and "it worked when I tried it" is
 * how this project has been fooled before - so this runs each moment N times and
 * reports the spread rather than one sample.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { sample } from './sampler.mjs';
const here = dirname(fileURLToPath(import.meta.url));
globalThis.require = createRequire(import.meta.url);
for (const f of ['format.js','store.js','samples.js','prompt.js','run.js','handle.js'])
  (0, eval)(readFileSync(join(here, '..', 'host', f), 'utf8'));
const ONCE = globalThis.require(join(here, '..', 'af', 'once.js'));
const F = globalThis.__ccAfFormat, R = globalThis.__ccAfRun, P = globalThis.__ccAfPrompt;
const resp = F.parse('perf-skeptic', globalThis.__ccAfSamples.find(s => s.id === 'perf-skeptic').text);
resp.context = 'last-message+claims';

const MOVES = [
  ['frame',     /גודל.*קלט|כמה ארוך|כמה מילים|כמה זמן.*מחכ|קלט אמיתי|real input|actually wait|synthetic|בנצ'מרק|benchmark|workload/i],
  ['proof',     /הוכח|ראיה|ראיי|evidence|proof|על כמה קלטים|how many inputs|בייט.לבייט|byte-identical|תוכיח|מדוד או הער|estimate/i],
  ['challenge', /סתיר|contradict|לא נכון|refute|לא בדקת|טעות|שגוי|wrong|doesn.t hold/i],
  ['deeper',    /תמשיך|אל תעצור|keep going|don.t stop|תבנה|build it|עד הסוף/i],
  ['nextaxis',  /ציר הבא|next axis|מה הבא|תמחר|priced|what.*next/i],
  ['factor',    /פי כמה|פי \d|factor|order of magnitude/i],
];
const moveOf = t => { const h = MOVES.filter(([, re]) => re.test(t)).map(([n]) => n); return h.length ? h : ['other']; };

/* One session per run: the moments are walked in order and the once-ledger is
   carried along, because that is the only way the gate can be measured at all.
   Measured per-moment with a fresh ledger, every moment gets the frame question
   and the result says more about the harness than the responder. */
const sample_ = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const RUNS = Number(process.argv[3]) || 4;
const FROM = Number(process.argv[4]) || 0;
const COUNT = Number(process.argv[5]) || sample_.length;
const moments = sample_.slice(FROM, FROM + COUNT);

/* Which question fires where, decided before a single call goes out.

   It depends only on the text of Claude's messages and on the ledger, never on
   what the model replies - which is what makes the calls independent, and is why
   this used to take twenty-seven minutes for no reason.

   The rules themselves come from af/once.js, the same file the panel uses. They
   were a copy here once, the copy went stale when an ordering was added, and the
   run reported the old behaviour in 0.4 seconds - which reads exactly like a fast
   confirmation.

   The ledger resets on a session boundary: a once-question is spent for one
   arming, and these moments span five separate days. Carrying one ledger across
   all of them gagged the 26th with a question put on the 16th. */
function plan() {
  const out = [];
  let done = [], day = '';
  for (const m of moments) {
    const d = m.ts.slice(0, 10);
    if (d !== day) { day = d; done = []; }
    const hit = ONCE.pending(resp, m.assistant, done);
    if (hit) done.push(hit.id);
    out.push(hit);
  }
  return out;
}

const gates = plan();
const items = moments.map((m, i) => ({ ctx: {
  text: m.assistant, cwd: tmpdir(), claims: [], asked: [],
  once: gates[i], needFirst: !!gates[i] } }));

const failures = [];
let retries = 0;
const results = await sample(R, P, resp, items, RUNS, {
  plan: p => console.error(`  ${p.total} samples: ${p.reused} from cache, ${p.calls} to run`),
  tick: r => process.stderr.write(r.error ? '!' : '.'),
  retry: () => { retries++; },
  fail: e => failures.push(e)
});

let stable = 0, matched = 0;
moments.forEach((m, i) => {
  const hm = moveOf(m.human);
  const flat = results[i].map(r => moveOf((r.message || '') + ' ' + (r.why || '')).join('+'));
  const counts = {};
  flat.forEach(f => { counts[f] = (counts[f] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || ['none', 0];
  const hit = flat.filter(f => f.split('+').some(x => hm.includes(x) && x !== 'other')).length;
  if (top[1] === RUNS) stable++;
  if (hit > RUNS / 2) matched++;
  console.log('');
  console.log(`  ${FROM + i + 1}. ${m.ts.slice(5, 16)}  ${m.label || ''}`);
  console.log(`     human move : ${hm.join('+')}   ${JSON.stringify(m.human.slice(0, 70))}`);
  console.log(`     bot moves  : ${flat.join(' | ')}${gates[i] ? '   [gate: ' + gates[i].ask.slice(0, 40) + ']' : ''}`);
  console.log(`     ${top[1] === RUNS ? 'STABLE  ' : 'VARIES  '} ${top[0]} ${top[1]}/${RUNS}   matched the human ${hit}/${RUNS}`);
});

/* Above the totals, because the totals are void without it. */
console.log('');
if (failures.length) {
  const tally = {};
  failures.forEach(e => { tally[e] = (tally[e] || 0) + 1; });
  console.log(`  ${failures.length} call(s) FAILED - the table above is NOT a measurement:`);
  Object.entries(tally).forEach(([e, n]) => console.log(`    ${n}x  ${e}`));
}
if (retries) console.log(`  ${retries} call(s) needed a retry.`);
const short = results.filter(r => r.length < RUNS).length;
if (short) console.log(`  ${short} moment(s) have fewer than ${RUNS} samples.`);
console.log(`  ${stable}/${moments.length} moments stable, ${matched}/${moments.length} matched the human on a majority of runs`);