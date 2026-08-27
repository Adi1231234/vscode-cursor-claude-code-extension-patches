/* run.js for real: the prompt it composes, and what happens when the CLI is not
   there. Everything else in this file is exercised through compose(), which is
   the part a wrong context setting would silently corrupt. */
const fs=require('fs'), path=require('path'), os=require('os');
const base=path.resolve(__dirname,'..','host')+'/';
process.env.CLAUDE_CONFIG_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'afrun-'));
for(const f of ['format.js','store.js','samples.js','prompt.js','run.js','handle.js']) eval(fs.readFileSync(base+f,'utf8'));
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
const child=R.run({id:'r',rules:'R',stop:'S',model:'definitely-not-a-model'},
  {text:'hi',claims:[],cwd:os.tmpdir()}, function(res){
    done=true;
    ok(!!res.error || typeof res.message==='string','a real spawn produced a verdict, not a hang');
    if(res.error) ok(res.error.length>0,'the error carries a reason: '+res.error.slice(0,60));
    else ok(true,'the CLI answered');
    console.log('\n  '+pass+' passed, '+fail+' failed');
    process.exit(fail?1:0);
  });
ok(child!==null || done,'run returned a handle or completed immediately');
setTimeout(function(){ if(!done){ console.log('  FAIL: the run never called back'); fail++;
  console.log('\n  '+pass+' passed, '+fail+' failed'); process.exit(1); } }, 120000);
