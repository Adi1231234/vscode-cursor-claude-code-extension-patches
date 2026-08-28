/* Replay a real session against the responder, and compare its follow-ups with
 * what the human actually typed.
 *
 *   node patches/auto-followup/tests/replay.mjs <turns.json>
 *
 * The fixture is [{assistant, human}, ...] pulled from a real transcript, and it
 * is NOT committed - it is somebody's conversation. Build one from a session log
 * and point this at it.
 *
 * Scripted scenarios can only test the rules I already thought of. This is the
 * only test here where the ground truth was written by a person who did not know
 * a responder would ever be measured against it.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const hostDir = join(here, '..', 'host');
const require = createRequire(import.meta.url);
globalThis.require = require;
for (const f of ['sections.js','format.js','store.js','samples.js','prompt.js','run.js','handle.js'])
  (0, eval)(readFileSync(join(hostDir, f), 'utf8'));
const F = globalThis.__ccAfFormat, R = globalThis.__ccAfRun;
const SAMPLE = globalThis.__ccAfSamples.find(s => s.id === 'perf-skeptic');

/* --independent runs each turn with no memory of what the bot said before.
   Without it the replay is unfair in one direction and unfair in the other:
   Claude's reply at turn N+1 answers the HUMAN, not the bot, so the bot correctly
   observes "you did not answer me" and escalates - forever, by construction. The
   fair question a replay can answer is the move-for-move one: given exactly what
   Claude said, does the bot reach for what the human reached for? */
const independent = process.argv.includes('--independent');
const fixture = process.argv[2];
if (!fixture) { console.error('usage: replay.mjs <turns.json>'); process.exit(2); }
const turns = JSON.parse(readFileSync(fixture, 'utf8'));

function unnumbered(l){ const c=l.indexOf('] '); return (l.charAt(0)==='['&&c>0)?l.slice(c+2):l; }
function addClaims(have, fresh, turn){
  const seen={}; have.forEach(l=>{seen[unnumbered(l)]=1;});
  (fresh||[]).forEach(c=>{ const b=String(c).trim(); if(!b||seen[b])return; seen[b]=1; have.push('['+turn+'] '+b); });
}
const run1 = (resp, ctx) => new Promise(res => R.run(resp, ctx, res));

const resp = F.parse('perf-skeptic', SAMPLE.text);
resp.context = 'last-message+claims';
const claims = [], asked = [];

for (let i = 0; i < turns.length; i++){
  const t = turns[i];
  const r = await run1(resp, { text: t.assistant, cwd: tmpdir(),
                               claims: independent ? [] : claims.slice(),
                               asked: independent ? [] : asked.slice(-5) });
  console.log(`\n${'-'.repeat(78)}\n  turn ${i+1}`);
  console.log(`  CLAUDE : ${t.assistant.replace(/\s+/g,' ').slice(0,190)}`);
  if (r.error){ console.log(`  ERROR  : ${r.error}`); break; }
  addClaims(claims, r.claims, i+1);
  console.log(`  HUMAN  : ${t.human.slice(0,190)}`);
  console.log(`  BOT    : ${r.stop ? 'STOP: ' + r.stop : r.message}`);
  if (!r.stop) { console.log(`  why    : ${r.why}`); asked.push(`[turn ${i+1}] ${r.message}`); }
  if (r.stop) break;
}
console.log(`\n${'-'.repeat(78)}\n  claims recorded: ${claims.length}`);
