/* Score the responder against a real human, over a real sample.
 *
 *   node patches/auto-followup/tests/score.mjs <sample.json> [n]
 *
 * The fixture is [{ts, assistant, human}, ...] drawn from real transcripts, and
 * is not committed - it is somebody's conversation.
 *
 * Each turn runs independently, with no memory of the bot's own earlier messages.
 * That is the only fair comparison a replay can make: in a replay Claude's next
 * message answers the HUMAN, so a bot that remembers its own unanswered question
 * escalates forever by construction. What this measures is the move, not the loop.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
globalThis.require = require;
for (const f of ['format.js','store.js','samples.js','prompt.js','run.js','handle.js'])
  (0, eval)(readFileSync(join(here, '..', 'host', f), 'utf8'));
const F = globalThis.__ccAfFormat, R = globalThis.__ccAfRun;
const resp = F.parse('perf-skeptic', globalThis.__ccAfSamples.find(s => s.id === 'perf-skeptic').text);
resp.context = 'last-message+claims';

/* The move a message is making. The human's vocabulary here is formulaic enough
   to classify by pattern - that is itself a finding from the transcript analysis -
   and the bot states its own move in 'why'. */
const MOVES = [
  ['frame',     /גודל.*קלט|כמה ארוך|כמה מילים|כמה זמן.*מחכ|העומס האמיתי|real input|actually wait|synthetic|בנצ'מרק|benchmark|workload/i],
  ['proof',     /הוכח|ראיה|evidence|proof|על כמה קלטים|how many inputs|בייט לבייט|byte-identical|תוכיח/i],
  ['challenge', /לא נכון|אני לא מאמין|בטוח\?|אתה בטוח|תערער|לא בדקת|מדידה לא נכונה|סתיר|contradict|refute|טעות/i],
  ['deeper',    /תחקור|לעומק|יותר לעומק|dig|investigate|keep going|תמשיך|אל תעצור|deeper/i],
  ['nextaxis',  /ציר הבא|next axis|מה הבא|priced|תמחר|כמה זה שווה|what.*next/i],
  ['factor',    /פי כמה|פי \d|factor|order of magnitude|במקום לכוונן/i],
  ['why',       /^למה|מדוע|^why\b/i],
];
function moveOf(text){
  const hits = MOVES.filter(([, re]) => re.test(text)).map(([n]) => n);
  return hits.length ? hits : ['other'];
}

const sample = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const N = Number(process.argv[3]) || sample.length;
/* A slice, because a full run outlives most timeouts: score.mjs f.json 12 12
   does turns 13..24 and prints its own totals to be added to the first half. */
const FROM = Number(process.argv[4]) || 0;
const run1 = (ctx) => new Promise(res => R.run(resp, ctx, res));

const rows = [];
for (let i = FROM; i < Math.min(FROM + N, sample.length); i++){
  const s = sample[i];
  const r = await run1({ text: s.assistant, cwd: tmpdir(), claims: [], asked: [] });
  if (r.error){ console.log(`  ${i+1}. ERROR ${r.error}`); continue; }
  const hm = moveOf(s.human), bm = moveOf((r.message||'') + ' ' + (r.why||''));
  const shared = hm.filter(m => bm.includes(m) && m !== 'other');
  rows.push({ i: i+1, ts: s.ts.slice(5,16), human: s.human, bot: r.message || ('STOP: '+r.stop),
              hm, bm, shared });
  console.log(`\n  ${i+1}. ${s.ts.slice(5,16)}   human[${hm.join(',')}]  bot[${bm.join(',')}]  ${shared.length ? 'MATCH ' + shared.join(',') : ''}`);
  console.log(`     human: ${s.human.slice(0,150)}`);
  console.log(`     bot  : ${(r.message||'').slice(0,150)}`);
}

/* Agreement with the human is NOT the score, and reporting it as one was wrong.
   The transcript analysis this work started from found that the generic pump -
   "תחקור לעומק" - is the human's most frequent move by a distance and bought
   single-digit percentages, while the specific moves bought the wins. A bot
   scored on matching him would be scored on reproducing the cheap half.

   So the measure is how often each side made a SPECIFIC move rather than a
   generic one. Agreement is printed underneath as information, not a verdict. */
const SPECIFIC = ['frame', 'proof', 'challenge', 'factor', 'nextaxis'];
const isSpecific = (ms) => ms.some((m) => SPECIFIC.includes(m));
const hSpec = rows.filter((r) => isSpecific(r.hm)).length;
const bSpec = rows.filter((r) => isSpecific(r.bm)).length;
const agreed = rows.filter((r) => r.shared.length).length;
const tally = (k) => { const c = {}; rows.forEach((r) => r[k].forEach((m) => { c[m] = (c[m] || 0) + 1; })); return c; };
const pct = (n) => `${n}/${rows.length} (${Math.round((n / rows.length) * 100)}%)`;
console.log(`\n${'='.repeat(78)}`);
console.log(`  turns scored               : ${rows.length}  (${FROM + 1}..${FROM + rows.length})`);
console.log(`  human made a specific move : ${pct(hSpec)}`);
console.log(`  bot made a specific move   : ${pct(bSpec)}`);
console.log(`  both on the same move      : ${pct(agreed)}   (information, not a score)`);
console.log(`  human moves : ${JSON.stringify(tally('hm'))}`);
console.log(`  bot moves   : ${JSON.stringify(tally('bm'))}`);
