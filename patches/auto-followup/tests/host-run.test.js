/* run.js for real: the prompt it composes, and what happens when the CLI is not
   there. Everything else in this file is exercised through compose(), which is
   the part a wrong context setting would silently corrupt. */
const fs=require('fs'), path=require('path'), os=require('os');
const base=path.resolve(__dirname,'..','host')+'/';
process.env.CLAUDE_CONFIG_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'afrun-'));
for(const f of ['sections.js','format.js','store.js','samples.js','prompt.js','hot.js','parse.js','run.js','handle.js']) eval(fs.readFileSync(base+f,'utf8'));
const R=globalThis.__ccAfRun;
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};

const resp={id:'r',name:'r',rules:'RULE ONE',stop:'STOP WHEN DONE',model:'sonnet'};

// --- compose
let p=R.compose(resp,{text:'CLAUDE SAID THIS',claims:[]});
ok(p.indexOf('RULE ONE')>=0,'rules are in the prompt');
ok(p.indexOf('STOP WHEN DONE')>=0,'stop condition is in the prompt');
ok(p.indexOf('CLAUDE SAID THIS')>=0,'the message is in the prompt');
ok(p.indexOf('"message"')>=0 && p.indexOf('"claims"')>=0,'the JSON contract is stated');
ok(p.indexOf('already asserted')<0,'no claims section when there are none');
ok(p.indexOf('conversation so far')<0,'no transcript section when there is none');

p=R.compose(resp,{text:'X',claims:['[3] 98.7 s','[5] identical']});
ok(p.indexOf('[3] 98.7 s')>=0 && p.indexOf('[5] identical')>=0,'claims are listed');
ok(p.indexOf('not given the reasoning')>=0,'and the responder is told the reasoning is withheld');

p=R.compose(resp,{text:'X',claims:[],transcript:'HUMAN: a\n\nCLAUDE: b'});
ok(p.indexOf('conversation so far')>=0,'full-session adds the transcript section');
ok(p.indexOf('HUMAN: a')>=0,'transcript content is included');
ok(p.indexOf('CLAUDE SAID THIS')<0,'and the previous case did not leak into it');

// the message must come last, so it is the thing being answered
const iMsg=p.lastIndexOf('which you are answering');
ok(iMsg>p.indexOf('conversation so far'),'the message being answered comes after the transcript');

// a responder with no stop condition still composes
const p2=R.compose({rules:'R',stop:'',model:'sonnet'},{text:'X',claims:[]});
ok(p2.indexOf('When to stop')<0,'an empty stop condition adds no heading');
ok(p2.indexOf('R')>=0,'rules still present');


// --- the CLI envelope: a CLI-level failure must never become a message
const okEnv=JSON.stringify({type:'result',subtype:'success',is_error:false,
  result:'{"message":"m","why":"w","claims":[],"stop":null}'});
let u=R.unwrap(okEnv);
ok(u.cli===null,'a successful envelope is not an error');
ok(u.text.indexOf('"message"')>=0,'the model output is taken from result');
ok(R.shape(R.extract(u.text),u.text).message==='m','and it parses through to a message');

const errEnv=JSON.stringify({type:'result',subtype:'error_during_execution',is_error:true,
  result:'Not logged in · Please run /login'});
u=R.unwrap(errEnv);
ok(typeof u.cli==='string' && u.cli.indexOf('Not logged in')>=0,'is_error becomes a CLI error: '+u.cli);
ok(u.text===undefined,'and carries no message text');

const subEnv=JSON.stringify({type:'result',subtype:'error_max_turns',is_error:false,result:'hit the cap'});
ok(typeof R.unwrap(subEnv).cli==='string','a non-success subtype is an error even when is_error is false');

// a bare model answer with no envelope still works, so an older CLI is not broken
u=R.unwrap('{"message":"bare","claims":[],"stop":null}');
ok(u.cli===null && u.text.indexOf('bare')>=0,'output with no envelope falls through unchanged');

// the prose fallback survives INSIDE a successful envelope - that was the
// approved behaviour and it is not what the CLI failure path took away
u=R.unwrap(JSON.stringify({type:'result',subtype:'success',is_error:false,result:'just prose'}));
const sh=R.shape(R.extract(u.text),u.text);
ok(u.cli===null && sh.invalid===true && sh.message==='just prose','prose from the model is still a message');

// --- the CLI missing must surface as an error, not a hang
let done=false;
// A turn where the panel chose the question is the contract, the goal, that
// question and Claude message - and it used to be nothing else, so a question
// asked on a cadence could not see that it had just gone out. Measured on a real
// run: the same demand for five routes three times in forty-five minutes, each
// discarding the last answer and lengthening a list of what was forbidden.
{
  const one=R.compose(resp,{text:'53.8 s',claims:[],asked:['[3] give me five routes'],
                            once:{ask:'five routes to 5.4x?'}});
  ok(one.indexOf('five routes to 5.4x?')>=0,'question turn: the chosen question is in it');
  ok(one.indexOf('What you have already sent')>=0,
     'question turn: and so is what it already sent');
  ok(one.indexOf('[3] give me five routes')>=0,'question turn: with the entries themselves');
  const none=R.compose(resp,{text:'53.8 s',claims:[],asked:[],once:{ask:'Q?'}});
  ok(none.indexOf('What you have already sent')<0,
     'question turn: nothing sent yet means no such section');
}

// The plan is handed back on every turn, both kinds. Sequential prompting loses
// the goal: what was decided drifts out of a long history and the loop stops
// working it. Re-injecting the list is what recovers it.
{
  const plan=['q6_K repack, 4 s','the baseline drift, unpriced'];
  const ordinary=R.compose(resp,{text:'53.8 s',claims:[],plan:plan});
  ok(ordinary.indexOf('# The plan, item one first')>=0,'plan: an ordinary turn carries it');
  ok(ordinary.indexOf('1. q6_K repack, 4 s')>=0,'plan: numbered, item one first');
  ok(ordinary.indexOf('Item one is what this turn is for')>=0,'plan: and says what to do with it');
  const asked=R.compose(resp,{text:'53.8 s',claims:[],plan:plan,once:{ask:'Q?'}});
  ok(asked.indexOf('# The plan, item one first')>=0,
     'plan: and so does a turn where the panel chose the question');
  ok(asked.indexOf('Q?')>=0,'plan: which still carries the question');
  const none=R.compose(resp,{text:'53.8 s',claims:[],plan:[]});
  ok(none.indexOf('# The plan')<0,'plan: nothing open means no such section');
}

const child=R.run({id:'r',rules:'R',stop:'S',model:'definitely-not-a-model'},
  {text:'hi',claims:[],cwd:os.tmpdir()}, function(res){
    done=true;
    ok(!!res.error || typeof res.message==='string','a real spawn produced a verdict, not a hang');
    if(res.error) ok(res.error.length>0,'the error carries a reason: '+res.error.slice(0,60));

    else ok(true,'the CLI answered');
    console.log('\n  '+pass+' passed, '+fail+' failed');
    process.exit(fail?1:0);
  });

// The model corrects itself out loud, and it cost about thirty turns. It writes
// one object, a line of prose saying it must add the missing keys, then the real
// object. First-brace-to-last-brace spans all three and parses as nothing, so a
// follow-up that was written correctly was marked invalid and parked - with
// autosend on, which is what made it look like the loop had stopped.
{
  const P = globalThis.__ccAfParse;
  const N = String.fromCharCode(10), Q = String.fromCharCode(34);
  const first = JSON.stringify({message:"first attempt"});
  const real  = JSON.stringify({message:"the corrected one",why:"w",
                                claims:["c1","c2"],axes:[],plan:[],stop:null});
  const out = first + N + N + "Wait - I must output exactly six keys. Let me correct." + N + N + real;

  const s = P.shape(P.extract(out), out);
  ok(s.invalid===false, "self-correction: the reply is not marked invalid");
  ok(s.message==="the corrected one", "self-correction: the corrected object wins, got "+JSON.stringify(s.message));
  ok(s.claims.length===2, "self-correction: and its claims come with it");

  // a stray {} after the answer must not beat it
  const trailing = real + N + "{}";
  ok(P.extract(trailing).message==="the corrected one", "a trailing empty object does not win");

  // the CLI envelope has no message and is still what comes back
  ok(P.extract(JSON.stringify({type:"result",result:"x"})).type==="result",
     "the CLI envelope is still found when it is the only object");

  // cut off in the middle: the message alone, never the whole envelope
  const cut = real.slice(0, real.indexOf("claims") + 20);
  const c = P.shape(P.extract(cut), cut);
  ok(c.invalid===true, "a reply cut off is still invalid");
  ok(c.message==="the corrected one", "and the message is recovered, got "+JSON.stringify(c.message).slice(0,60));
  ok(c.message.indexOf("claims")<0, "so the ledger is not sent as a prompt");

  // A lone backslash is how a model breaks its own JSON: a regex or a Windows
  // path written with one where JSON needs two. Repairing and parsing again
  // recovers the whole answer, ledger included.
  const BS = String.fromCharCode(92);
  const lone = first + N + N + "Let me correct." + N + N +
        String.fromCharCode(123) + Q + "message" + Q + ":" + Q + "the corrected one" + Q + "," +
        Q + "claims" + Q + ":[" + Q + "the regex ^" + BS + "s*(" + BS + "d+)" + Q + "]," +
        Q + "why" + Q + ":" + Q + "w" + Q + "," + Q + "axes" + Q + ":[]," +
        Q + "plan" + Q + ":[]," + Q + "stop" + Q + ":null" + String.fromCharCode(125);
  const r = P.shape(P.extract(lone), lone);
  ok(r.invalid===false, "a lone backslash is repaired, not thrown away");
  ok(r.message==="the corrected one", "and the corrected object still wins");
  ok(r.claims.length===1, "and its claims come with it");

  // An answer started after the last complete one and cut off is the model's
  // last word. Nothing earlier may stand in for it: a draft sent silently is
  // worse than a reply parked in view.
  const stopped = first + N + N + "Let me correct." + N + N +
                  String.fromCharCode(123) + Q + "message" + Q + ":" + Q + "cut off here";
  const t = P.shape(P.extract(stopped), stopped);
  ok(t.invalid===true, "a truncated answer is not answered with the draft above it");
  ok(t.message==="cut off here", "and its message is recovered as far as it got, got "+JSON.stringify(t.message));
}

ok(child!==null || done,'run returned a handle or completed immediately');
setTimeout(function(){ if(!done){ console.log('  FAIL: the run never called back'); fail++;
  console.log('\n  '+pass+' passed, '+fail+' failed'); process.exit(1); } }, 120000);
