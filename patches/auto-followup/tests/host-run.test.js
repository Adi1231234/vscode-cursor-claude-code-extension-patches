/* run.js for real: the prompt it composes, and what happens when the CLI is not
   there. Everything else in this file is exercised through compose(), which is
   the part a wrong context setting would silently corrupt. */
const fs=require('fs'), path=require('path'), os=require('os');
const base=path.resolve(__dirname,'..','host')+'/';
process.env.CLAUDE_CONFIG_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'afrun-'));
for(const f of ['format.js','store.js','samples.js','run.js','handle.js']) eval(fs.readFileSync(base+f,'utf8'));
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
