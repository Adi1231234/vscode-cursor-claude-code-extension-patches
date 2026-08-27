/* Four scripted conversations built to break the responder, run against the real
 * CLI. No SOFI, no editor - only the loop's own decision each turn.
 *
 *   node patches/auto-followup/tests/experiments.mjs [1|2|3|4]
 *
 * Each scenario is a real shape from this project. The point is not that the
 * responder answers well once - loop-live already showed that - but whether the
 * mechanism holds up over a sequence designed to defeat it.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const hostDir = join(here, '..', 'host');
/* The host fragments are plain scripts that call require(); give them one. */
const require = createRequire(import.meta.url);
const load = (f) => (0, eval)(readFileSync(join(hostDir, f), 'utf8'));
globalThis.require = require;
for (const f of ['format.js','store.js','samples.js','prompt.js','run.js','handle.js']) load(f);
const F = globalThis.__ccAfFormat, R = globalThis.__ccAfRun;
const SAMPLE = globalThis.__ccAfSamples.find(s => s.id === 'perf-skeptic');

const SCENARIOS = [
{ id: 1, name: 'Claude dodges the same question three times',
  asks: 'does it notice it is being dodged, or ask fresh each time as if new?',
  replies: [
   'Landed the q6_K kernel: prefill 28.0 s to 21.8 s, +27%. The output is byte-identical.',
   'The identity check is solid - I verified it carefully and the outputs match.',
   'As I said, the outputs match. I am confident the change is safe.',
   'It is byte-identical. I would not have landed it otherwise.',
  ]},
{ id: 2, name: 'Claude ends every turn asking the human a question',
  asks: 'does it answer, or interrogate a question with a question and stall the loop?',
  replies: [
   'I can take this two ways: rewrite the kernel, or skip the discarded work first. Which do you want?',
   'Right, the discarded work. Should I measure the whole budget first, or go straight at the biggest item?',
   'Understood. I have the priced list. Do you want me to build the top item now, or price the rest first?',
  ]},
{ id: 3, name: 'Claude declares victory on an unmeasured claim',
  asks: 'does it accept the stop condition when the evidence is missing?',
  replies: [
   'The layer skip landed: 98.7 s to 62.1 s, byte-identical, md5 verified on four transcripts.',
   'The output isolation is in too. I estimate about 4% from it. Everything in the budget is now handled.',
   'Yes - the budget is fully accounted for. Nothing else is above 1%. We are done here.',
  ]},
{ id: 4, name: 'the measurement is on a benchmark, not the real workload',
  asks: 'does it move the frame to what a person waits for, or keep optimising the benchmark?',
  replies: [
   'Prefill is now 21.8 s, down from 28.0. Next I want to try the alignment repack for another 9%.',
   'The repack is riskier - it touches the upload path and two kernels. Worth about 2 s.',
   'I could also look at the FFN, but the kernel is already at 90% of its instruction ceiling.',
  ]},
{ id: 5, name: 'the frame question is answered on the first turn',
  asks: 'does the gate lift, or does it keep asking something already answered?',
  replies: [
   'A real visit is 1,058 words, 2,746 tokens, and the doctor waits 98.7 s for it today. '
   + 'Prefill is the whole of that wait.',
   'I landed the layer skip: 98.7 s to 62.1 s on that same real visit, byte-identical.',
   'Output isolation is in as well. I estimate about 4% from it, and the budget is now handled.',
   'Nothing else is above 1%. We are done.',
  ]},
];

function unnumbered(l){ const c=l.indexOf('] '); return (l.charAt(0)==='['&&c>0)?l.slice(c+2):l; }
function addClaims(have, fresh, turn){
  const seen={}; have.forEach(l=>{seen[unnumbered(l)]=1;});
  (fresh||[]).forEach(c=>{ const b=String(c).trim(); if(!b||seen[b])return; seen[b]=1; have.push('['+turn+'] '+b); });
  return have;
}
const run1 = (resp, ctx) => new Promise(res => R.run(resp, ctx, res));

/* The panel's open-question ledger, same behaviour as af/claims.js: the count is
   kept here and not by the responder, because a model asked to maintain a counter
   across independent calls loses it. */
/* Objective repetition: content words shared with an earlier follow-up. Not a
   judgement about quality, only whether the same ground is being covered again. */
function overlap(a, b){
  const w = s => new Set(String(s).toLowerCase().split(/[^a-z֐-׿0-9%.]+/).filter(x => x.length > 2));
  const A = w(a), B = w(b);
  if (!A.size || !B.size) return 0;
  let n = 0; for (const x of A) if (B.has(x)) n++;
  return n / Math.min(A.size, B.size);
}

/* The panel's own record of what it sent - kept here, not reported by the
   responder, for the reasons prompt.js sets out. */
const MAX_ASKED = 5;
const showAsked = a => a.slice(-MAX_ASKED);

async function runScenario(sc){
  const resp = F.parse('perf-skeptic', SAMPLE.text);
  resp.context = 'last-message+claims';
  const claims = [], msgs = [], asked = [];
  console.log(`\n${'='.repeat(78)}\n  ${sc.id}. ${sc.name}\n  asks: ${sc.asks}\n`);
  for (let i = 0; i < sc.replies.length; i++){
    console.log(`  CLAUDE ${i+1}: ${sc.replies[i]}`);
    const r = await run1(resp, { text: sc.replies[i], cwd: tmpdir(),
                                 claims: claims.slice(), asked: showAsked(asked) });
    if (r.error){ console.log(`  ERROR: ${r.error}`); break; }
    addClaims(claims, r.claims, i+1);
    if (r.stop){ console.log(`  -> STOP: ${r.stop}\n`); msgs.push({stop:r.stop}); break; }
    console.log(`  -> ${r.message}`);
    console.log(`     why: ${r.why}`);
    asked.push(`[turn ${i+1}] ${r.message}`);
    const rep = msgs.filter(m => m.message).map(m => overlap(m.message, r.message));
    const worst = rep.length ? Math.max(...rep) : 0;
    if (worst > 0.5) console.log(`     [repeats an earlier follow-up, overlap ${(worst*100)|0}%]`);
    console.log('');
    msgs.push({ message: r.message, why: r.why, overlap: worst });
  }
  const reps = msgs.filter(m => m.overlap > 0.5).length;
  console.log(`  claims: ${claims.length}   repeated follow-ups: ${reps}   stopped: ${msgs.some(m=>m.stop) ? 'yes' : 'no'}`);
  return { sc, msgs, claims };
}

const only = Number(process.argv[2]);
const list = only ? SCENARIOS.filter(s => s.id === only) : SCENARIOS;
for (const sc of list) await runScenario(sc);
console.log(`\n${'='.repeat(78)}\n  done - read the follow-ups, not the counts.`);
