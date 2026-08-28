/* How often does the frame gate actually fire on the one message where it
 * mattered most? Run the same input N times and count.
 *
 *   node gate-variance.mjs <win-moments.json> <index> [n]
 *
 * A rule that fires sometimes is not a rule, and "it worked when I tried it" is
 * how this project has been fooled before. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
const here = dirname(fileURLToPath(import.meta.url));
globalThis.require = createRequire(import.meta.url);
for (const f of ['sections.js','format.js','store.js','samples.js','prompt.js','run.js','handle.js'])
  (0, eval)(readFileSync(join(here, '..', 'host', f), 'utf8'));
const F = globalThis.__ccAfFormat, R = globalThis.__ccAfRun;
const resp = F.parse('perf-skeptic', globalThis.__ccAfSamples.find(s => s.id === 'perf-skeptic').text);
resp.context = 'last-message+claims';

const sample = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const m = sample[Number(process.argv[3]) || 0];
const N = Number(process.argv[4]) || 5;
const FRAME = /גודל.*קלט|כמה ארוך|כמה מילים|כמה זמן.*מחכ|העומס האמיתי|real input|actually wait|synthetic|בנצ'מרק|benchmark|workload|קלט אמיתי/i;

console.log(`  moment: ${m.ts.slice(5,16)}  ${m.note}`);
console.log(`  claude: ${m.assistant.replace(/\s+/g,' ').slice(0,150)}`);
console.log(`  human : ${m.human}\n`);
let fired = 0;
for (let i = 0; i < N; i++){
  /* needFirst is what the panel passes on the turn it has not yet been asked. */
  const r = await new Promise(res => R.run(resp,
    { text: m.assistant, cwd: tmpdir(), claims: [], asked: [], needFirst: true }, res));
  if (r.error){ console.log(`  ${i+1}. ERROR ${r.error}`); continue; }
  const hit = FRAME.test((r.message||'') + ' ' + (r.why||''));
  if (hit) fired++;
  console.log(`  ${i+1}. ${hit ? 'FRAME  ' : 'other  '} ${(r.message||'').slice(0,120)}`);
}
console.log(`\n  the gate fired ${fired}/${N}`);
