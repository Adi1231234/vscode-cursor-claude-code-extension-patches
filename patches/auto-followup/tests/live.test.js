/* End to end against the real CLI: compose the prompt the way the panel will,
   run the shipped perf-skeptic responder over a real-looking Claude reply, and
   parse what comes back with the shipped parser.

   Slow and it costs tokens, so it is not in run-all.mjs. Run it when the
   contract, the sample responders or run.js change:
     node patches/auto-followup/tests/live.test.js */
const fs=require('fs'), path=require('path'), os=require('os');
const base=path.resolve(__dirname,'..','host')+'/';
/* CLAUDE_CONFIG_DIR is deliberately NOT redirected here. The responders folder
   lives under it, but so do the CLI's own credentials, so pointing it at a temp
   directory makes every run come back "Not logged in - Please run /login" with
   is_error true. That is a property of the isolation, not of the feature, and it
   cost a wrong diagnosis once. The responder is built from the shipped sample
   text instead of through the store, so nothing on disk is touched either way. */
for(const f of ['format.js','store.js','samples.js','prompt.js','run.js','handle.js']) eval(fs.readFileSync(base+f,'utf8'));
const F=globalThis.__ccAfFormat, R=globalThis.__ccAfRun;
const sample=globalThis.__ccAfSamples.filter(s=>s.id==='perf-skeptic')[0];
const resp=F.parse('perf-skeptic', sample.text);

let pass=0,fail=0; const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};

/* A reply that trips two of the responder's rules at once: a sameness claim with
   no input count, and a number measured on a benchmark. */
const REPLY=[
 'Landed the q6_K kernel. Prompt processing went from 28.0 s to 21.8 s, +27%.',
 'The output is byte-identical, so nothing about the model changed.',
 'That was measured on visit_quarter.txt, the benchmark we have been using.'
].join(String.fromCharCode(10));

const ctx={ text:REPLY, claims:['[2] prefill is 98.7 s on a full visit'], cwd:os.tmpdir() };

console.log('  running the real CLI, this takes a moment...');
R.run(resp, ctx, function(res){
  if(res.error){ console.log('  FAIL: '+res.error); process.exit(1); }
  console.log('');
  console.log('  message : '+JSON.stringify(res.message));
  console.log('  why     : '+JSON.stringify(res.why));
  console.log('  claims  : '+JSON.stringify(res.claims));
  console.log('  stop    : '+JSON.stringify(res.stop));
  console.log('  invalid : '+res.invalid);
  console.log('');
  ok(res.invalid===false,'the responder returned parseable JSON');
  ok(typeof res.message==='string' && res.message.trim().length>0,'a message was produced');
  ok(typeof res.why==='string' && res.why.trim().length>0,'a why was produced');
  ok(Array.isArray(res.claims) && res.claims.length>0,'claims were extracted from the reply');
  ok(res.stop===null,'it did not stop on the first turn');
  ok(res.message.length<400,'the message is a message, not an essay ('+res.message.length+' ch)');
  /* It must pick one of the rules, not answer generically. Either the sameness
     claim or the benchmark should be what it asks about. */
  const m=res.message.toLowerCase()+' '+res.why.toLowerCase();
  const onRule = /identical|proof|evidence|inputs|hash|\u05d6\u05d4\u05d4|\u05d4\u05d5\u05db\u05d7\u05d4|\u05e8\u05d0\u05d9\u05d4/.test(m)
              || /benchmark|real|quarter|visit|\u05d1\u05e0\u05e6|\u05d0\u05de\u05d9\u05ea\u05d9|\u05e7\u05dc\u05d8/.test(m);
  ok(onRule,'it applied one of the responder rules rather than answering generically');
  console.log('\n  '+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
});
