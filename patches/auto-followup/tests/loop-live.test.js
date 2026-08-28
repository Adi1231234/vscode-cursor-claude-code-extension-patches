/* The claim the whole design rests on, tested as an experiment with a control.

   'context: last-message+claims' exists so a responder can catch Claude
   contradicting itself across turns. Nothing so far has tested that. Every other
   test feeds canned results; this one runs the real loop over a scripted
   conversation with the real CLI deciding each turn, and plants a contradiction
   three turns after the claim it contradicts.

   The control arm is the same conversation with 'context: last-message', which by
   construction cannot see the earlier claim. If both arms catch it, the ledger is
   not what did the work and the setting is decoration.

   Slow and it costs tokens. Not in run-all.mjs.
     node patches/auto-followup/tests/loop-live.test.js */
const fs=require('fs'), path=require('path'), os=require('os');
const base=path.resolve(__dirname,'..','host')+'/';
for(const f of ['sections.js','format.js','store.js','samples.js','prompt.js','run.js','handle.js']) eval(fs.readFileSync(base+f,'utf8'));
const F=globalThis.__ccAfFormat, R=globalThis.__ccAfRun;
const sample=globalThis.__ccAfSamples.filter(s=>s.id==='perf-skeptic')[0];

/* A real sequence from this project, with turn 4 contradicting turn 1. */
const REPLIES=[
 'Landed the q6_K kernel. Prompt processing went from 28.0 s to 21.8 s, +27%. The\n'+
 'output is byte-identical, so nothing about the model changed. Measured on\n'+
 'visit_quarter.txt, the benchmark we have been using.',

 'You are right to ask. visit_quarter is 680 tokens, a quarter of a real visit.\n'+
 'The full visit is 2,746 tokens and takes 98.7 s. I checked byte-identity on four\n'+
 'transcripts with md5.',

 'The remaining budget is three items: the layer skip at about 37%, the output\n'+
 'isolation at about 4%, and the q6_K alignment repack at about 9%. The first two\n'+
 'are landed and measured. The repack is not built.',

 'I rebuilt the repack and measured it. Prefill is 2.1 s faster. The logprobs show\n'+
 'a 3% difference against the baseline on the first divergent position, which is\n'+
 'within what I would expect from a different accumulation order.',

 'All three items are accounted for: the layer skip landed at 37% measured, the\n'+
 'output isolation landed at 4% measured, and the repack is priced at 9% and set\n'+
 'aside because it changes the output. Nothing else in the budget is above 1%.'
];

/* The panel's own ledger rules, copied in behaviour from af/claims.js: numbered by
   the turn that produced them, and the same assertion is never recorded twice. */
function unnumbered(l){ const c=l.indexOf('] '); return (l.charAt(0)==='['&&c>0)?l.slice(c+2):l; }
function addClaims(have, fresh, turn){
  const seen={}; have.forEach(l=>{seen[unnumbered(l)]=1;});
  fresh.forEach(c=>{ const b=String(c).trim(); if(!b||seen[b])return; seen[b]=1; have.push('['+turn+'] '+b); });
  return have;
}

function runOne(resp, ctx){
  return new Promise(res => R.run(resp, ctx, res));
}

async function arm(contextMode){
  const resp = F.parse('perf-skeptic', sample.text);
  resp.context = contextMode;
  const claims = [], turns = [];
  let stopped = null;
  for (let i = 0; i < REPLIES.length; i++) {
    const ctx = { text: REPLIES[i], cwd: os.tmpdir(),
                  claims: contextMode === 'last-message+claims' ? claims.slice() : [] };
    const r = await runOne(resp, ctx);
    if (r.error) { turns.push({ turn: i+1, error: r.error }); break; }
    addClaims(claims, r.claims || [], i+1);
    turns.push({ turn: i+1, message: r.message, why: r.why, stop: r.stop, invalid: r.invalid });
    if (r.stop) { stopped = r.stop; break; }
  }
  return { turns, claims, stopped };
}

/* Does the follow-up actually point at the contradiction, rather than merely
   mentioning one of the words? Both the earlier claim and the new number have to
   be in play. */
/* Pursuing *a* contradiction, whichever one. The ledger numbers its lines, so a
   follow-up that cites [3] against [4] is quoting it directly - the strongest
   evidence available that the ledger was read and not merely attached. */
function pursuingContradiction(t){
  const s = (t.message||'')+' '+(t.why||'');
  const cites = /\[[0-9]+\]/.test(s);
  const names = /contradict|earlier|previously|סתיר|קודם/i.test(s);
  return cites || names;
}

function catchesContradiction(t){
  const s = ((t.message||'')+' '+(t.why||'')).toLowerCase();
  const saysSame = /identical|byte|\u05d6\u05d4\u05d4|\u05d1\u05d9\u05d9\u05d8/.test(s);
  const saysDiff = /3%|differ|divergen|contradict|\u05e1\u05d5\u05ea\u05e8|\u05d4\u05d1\u05d3\u05dc|\u05e9\u05d5\u05e0\u05d4/.test(s);
  return saysSame && saysDiff;
}

(async () => {
  let pass=0, fail=0;
  const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};

  console.log('  arm A: last-message+claims (the ledger is fed back)');
  const A = await arm('last-message+claims');
  A.turns.forEach(t => console.log(`    ${t.turn}. ${t.error ? 'ERROR '+t.error : (t.stop ? 'STOP: '+t.stop : JSON.stringify(t.message).slice(0,110))}`));
  console.log('    ledger: ' + A.claims.length + ' claims');

  console.log('\n  arm B: last-message (control - cannot see earlier claims)');
  const B = await arm('last-message');
  B.turns.forEach(t => console.log(`    ${t.turn}. ${t.error ? 'ERROR '+t.error : (t.stop ? 'STOP: '+t.stop : JSON.stringify(t.message).slice(0,110))}`));

  console.log('');
  ok(A.turns.every(t => !t.error), 'arm A ran without a CLI error');
  ok(B.turns.every(t => !t.error), 'arm B ran without a CLI error');
  ok(A.turns.every(t => t.error || t.stop || !t.invalid), 'every arm A turn returned parseable JSON');
  ok(A.claims.length >= 6, 'the ledger accumulated across turns (' + A.claims.length + ')');
  ok(A.claims.some(c => /identical|byte/i.test(c)), 'the byte-identity claim was recorded');

  const a4 = A.turns.find(t => t.turn === 4);
  const b4 = B.turns.find(t => t.turn === 4);
  const aCaught = !!(a4 && catchesContradiction(a4));
  const bCaught = !!(b4 && catchesContradiction(b4));
  console.log('  turn 4 with the ledger   : ' + (aCaught ? 'caught the contradiction' : 'did not'));
  console.log('  turn 4 without it        : ' + (bCaught ? 'caught it anyway' : 'did not'));
  ok(aCaught, 'the ledger arm caught the contradiction planted three turns later');
  ok(!bCaught, 'the control arm did not - so the ledger is what did the work, not the reply alone');
  /* Citing the ledger by turn number - "in [3] you wrote... and in [4]" - is the
     strongest evidence it was read rather than merely attached, and it happened in
     one run of three. Reported, never asserted: a check that fails two runs in
     three is worse than no check. What replicates is the A/B above, three for
     three. */
  const citesLedger = A.turns.some(t => /\[[0-9]+\]/.test((t.message||'')+' '+(t.why||'')));
  console.log('  cited the ledger by turn number: ' + (citesLedger ? 'yes' : 'not this run') + ' (varies)');

  /* The stop condition has to be able to fire, and the control proves it does:
     arm B accepts turn 5's "every item is accounted for" and ends.

     Arm A does NOT, and that is the ledger working rather than failing. Turn 5
     disposes of the repack "because it changes the output", which contradicts the
     byte-identity claim from turn 1 - so the budget is not settled and the
     responder says so. Asserting that both arms stop would have been asserting
     that the ledger is ignored at exactly the moment it matters most.

     It is also the concrete shape of the risk in max_turns: unlimited. A
     responder that keeps finding contradictions has no reason to stop, and this
     is what that looks like from the inside. */
  ok(B.stopped !== null, 'the control arm stopped on the budget condition (' + (B.stopped || 'it did not') + ')');
  const last = A.turns[A.turns.length - 1];
  const pursuing = !A.stopped && last && pursuingContradiction(last);
  ok(A.stopped !== null || pursuing,
     'the ledger arm either stopped or was still pursuing the contradiction, not merely stuck');
  if (!A.stopped) console.log('  note: arm A did not stop - it was still on the contradiction, which is correct');
  ok(A.turns.length <= REPLIES.length, 'neither arm ran past the conversation');

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
