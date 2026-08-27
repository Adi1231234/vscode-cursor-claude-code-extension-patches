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
const here = dirname(fileURLToPath(import.meta.url));
globalThis.require = createRequire(import.meta.url);
for (const f of ['format.js','store.js','samples.js','prompt.js','run.js','handle.js'])
  (0, eval)(readFileSync(join(here, '..', 'host', f), 'utf8'));
const F = globalThis.__ccAfFormat, R = globalThis.__ccAfRun;
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
const sample = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const RUNS = Number(process.argv[3]) || 4;
const FROM = Number(process.argv[4]) || 0;
const COUNT = Number(process.argv[5]) || sample.length;
const moments = sample.slice(FROM, FROM + COUNT);

function idFor(ask) {
  let h = 5381;
  for (let i = 0; i < ask.length; i++) h = ((h * 33) ^ ask.charCodeAt(i)) >>> 0;
  return 'q' + h.toString(36);
}
function pendingOnce(done, text) {
  for (const e of resp.once || []) {
    const ask = (e.ask || '').trim();
    if (!ask || done.has(idFor(ask))) continue;
    let re; try { re = new RegExp(e.when, 'i'); } catch { continue; }
    if (re.test(text)) return { id: idFor(ask), ask };
  }
  return null;
}

const seen = moments.map(() => []);
const errors = [];
let retried = 0;
const call = (m, once) => new Promise(res => R.run(resp,
  { text: m.assistant, cwd: tmpdir(), claims: [], asked: [], once, needFirst: !!once }, res));
const gated = moments.map(() => 0);
for (let k = 0; k < RUNS; k++) {
  let done = new Set(), day = '';
  for (let i = 0; i < moments.length; i++) {
    /* A once-question is spent for one arming, and these moments span five days.
       Carrying one ledger across all of them gagged the 26th with a question put
       on the 16th - which read as the responder losing its best move. */
    const d = moments[i].ts.slice(0, 10);
    if (d !== day) { day = d; done = new Set(); }
    const once = pendingOnce(done, moments[i].assistant);
    if (once) { done.add(once.id); gated[i]++; }
    /* One retry after a pause. Twenty-four consecutive calls came back empty in
       one run and two of the four sessions scored as moves that were never made,
       so a transient failure must cost a pause and not a whole measurement.
       Retries are counted and printed: a run that needed many of them is a run
       whose conditions were not what the table says. */
    let r = await call(moments[i], once);
    if (r.error) {
      retried++;
      await new Promise(z => setTimeout(z, 20000));
      r = await call(moments[i], once);
    }
    if (r.error) errors.push(String(r.error).slice(0, 200));
    seen[i].push(r.error ? ['error'] : moveOf((r.message || '') + ' ' + (r.why || '')));
    process.stderr.write(r.error ? '!' : '.');
  }
}

let stable = 0, matched = 0;
moments.forEach((m, i) => {
  const hm = moveOf(m.human);
  const flat = seen[i].map(s => s.join('+'));
  const counts = {};
  flat.forEach(f => { counts[f] = (counts[f] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const hit = seen[i].filter(s => s.some(x => hm.includes(x) && x !== 'other')).length;
  if (top[1] === RUNS) stable++;
  if (hit > RUNS / 2) matched++;
  console.log(`\n  ${FROM + i + 1}. ${m.ts.slice(5, 16)}  ${m.label || ''}`);
  console.log(`     human move : ${hm.join('+')}   ${JSON.stringify(m.human.slice(0, 70))}`);
  console.log(`     bot moves  : ${flat.join(' | ')}${gated[i] ? '   [gate fired ' + gated[i] + '/' + RUNS + ']' : ''}`);
  console.log(`     ${top[1] === RUNS ? 'STABLE  ' : 'VARIES  '} ${top[0]} ${top[1]}/${RUNS}   matched the human ${hit}/${RUNS}`);
});
/* Printed before the totals, because the totals are void without it. A discarded
   error reads as a move: half of one run came back empty and the table it printed
   looked like a finding until the counts were read. */
if (errors.length) {
  const tally = {};
  errors.forEach(e => { tally[e] = (tally[e] || 0) + 1; });
  console.log('');
  console.log(`  ${errors.length} of ${moments.length * RUNS} calls FAILED - the table above is NOT a measurement:`);
  Object.entries(tally).forEach(([e, n]) => console.log(`    ${n}x  ${e}`));
}
if (retried) console.log(`  ${retried} call(s) needed a retry.`);
console.log(`\n  ${stable}/${moments.length} moments stable, ${matched}/${moments.length} matched the human on a majority of runs`);