require('./dom-stubs.js');
const fs=require('fs');
const B=require('path').resolve(__dirname,'..','af')+'/';
const order=['config','bridge','claims','button','menu','lane','transcript','dialog','dialog-form','dialog-foot','loop','runtime'];
let src=order.map(f=>fs.readFileSync(B+f+'.js','utf8')).join('');
src=src.split('/* AUTOFOLLOWUP */').join('').split('</script>').join('');src=src.replace(/^[\s\S]*?\(function\(\)\{/,'(function(){');
// expose internals for the test only
src=src.split('__MSG__').join('message_X').split('__USERMSG__').join('userMessage_X')
         .split('__THINK__').join('thinking_X').split('__TOOLUSE__').join('toolUse_X')
         .split('__TOOLRES__').join('toolResult_X');
src=src.replace('  requestList();\n  setInterval(', '  globalThis.__t={arm:arm,disarm:disarm,onHostMessage:onHostMessage,maybeRun:maybeRun,maybeSend:maybeSend,approve:approve,state:()=>({armed:armed,turns:turns,slot:slot,stopped:stopped,pending:pending,claims:readClaims(),autosend:autosend()})};\n  requestList();\n  setInterval(');
eval(src);

let pass=0,fail=0; const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};
const T=globalThis.__t, S=()=>T.state();

ok(typeof T.arm==='function','script loaded without throwing');
globalThis.__tick();   // one real pass, so sid is read like it is in production
ok(globalThis.sent.some(m=>m.op==='list'),'asks the host for the list on load');

// deliver a responder list
globalThis.__onMsg({data:{type:'__ccaf',op:'list',items:[
  {id:'perf-skeptic',name:'perf-skeptic',description:'d',context:'last-message+claims',max_turns:'20',autosend:'false',model:'sonnet',rules:'r',stop:'s'},
  {id:'unl',name:'unl',context:'full-session',max_turns:'unlimited',autosend:'true',model:'opus',rules:'r',stop:'s'}]}});

// 1. arming
globalThis.__msgs=[{role:'user',content:'hi'},{role:'assistant',content:'first reply'}];
T.arm('perf-skeptic');
ok(S().armed==='perf-skeptic','armed');
ok(globalThis.__store['ccAfArmed:sess-1']==='perf-skeptic','arming persisted per session');

// 2. does NOT answer the reply that was already on screen
globalThis.sent.length=0;
T.maybeRun();
ok(!globalThis.sent.some(m=>m.op==='run'),'does not answer a reply that predates arming');

// 3. a new reply triggers exactly one run
globalThis.__msgs.push({role:'assistant',content:'second reply, 98.7 seconds'});
T.maybeRun();
const runs=globalThis.sent.filter(m=>m.op==='run');
ok(runs.length===1,'one run requested, got '+runs.length);
ok(runs[0] && runs[0].ctx.text==='second reply, 98.7 seconds','ctx carries the last assistant text');
ok(runs[0] && runs[0].ctx.cwd==='C:/proj','ctx carries the cwd');
ok(runs[0] && Array.isArray(runs[0].ctx.claims),'ctx carries a claims array');
ok(!runs[0].ctx.transcript,'last-message+claims does not send the transcript');

// 4. no second run while one is in flight
globalThis.sent.length=0; T.maybeRun();
ok(globalThis.sent.filter(m=>m.op==='run').length===0,'no double run while pending');

// 5. result fills the slot and records claims
globalThis.__onMsg({data:{type:'__ccaf',op:'result',rid:runs[0].rid,message:'was that proof?',why:'sameness claim',claims:['98.7 s prefill'],stop:null}});
ok(S().slot && S().slot.message==='was that proof?','slot filled');
ok(S().turns===1,'turn counted');
ok(S().claims.length===1 && S().claims[0].indexOf('98.7 s prefill')>0,'claim recorded: '+JSON.stringify(S().claims));
ok(S().claims[0].indexOf('[1]')===0,'claim numbered by turn');

// 6. autosend:false holds the first one
globalThis.__sentText=null; T.maybeSend();
ok(globalThis.__sentText===null,'first message held for approval');
ok(S().autosend===false,'gate closed before approval');
T.approve();
ok(globalThis.__sentText==='was that proof?','approval releases it');
ok(S().autosend===true,'gate open after approval');

// 7. the user's queue wins
globalThis.__msgs.push({role:'assistant',content:'third'});
globalThis.__qAutoState.count=2; globalThis.sent.length=0;
T.maybeRun();
ok(globalThis.sent.filter(m=>m.op==='run').length===0,'no run while the user has items queued');
globalThis.__qAutoState.count=0;
globalThis.__qAutoState.paused=true;
T.maybeRun();
ok(globalThis.sent.filter(m=>m.op==='run').length===0,'no run while the queue is paused');
globalThis.__qAutoState.paused=false;

// 8. a stop reason ends it
globalThis.sent.length=0; T.maybeRun();
const r2=globalThis.sent.filter(m=>m.op==='run')[0];
globalThis.__onMsg({data:{type:'__ccaf',op:'result',rid:r2.rid,message:'x',claims:[],stop:'budget accounted for'}});
ok(S().armed===null,'stop reason disarms');
ok(S().stopped==='budget accounted for','stop reason kept for the tooltip');
ok(!globalThis.__store['ccAfArmed:sess-1'],'arming cleared from storage');
ok(S().claims.length===1,'claims survive the loop ending');

// 9. an error disarms with the reason visible
T.arm('perf-skeptic'); globalThis.__msgs.push({role:'assistant',content:'fourth'});
globalThis.sent.length=0; T.maybeRun();
const r3=globalThis.sent.filter(m=>m.op==='run')[0];
globalThis.__onMsg({data:{type:'__ccaf',op:'result',rid:r3.rid,error:'could not start the claude CLI'}});
ok(S().armed===null && S().stopped==='could not start the claude CLI','CLI failure surfaces as the stop reason');

// 10. another panel's result is ignored
T.arm('perf-skeptic'); globalThis.__msgs.push({role:'assistant',content:'fifth'});
globalThis.sent.length=0; T.maybeRun();
globalThis.__onMsg({data:{type:'__ccaf',op:'result',rid:'someone-else:99',message:'not mine',claims:[],stop:null}});
ok(!S().slot,'a result for another rid is ignored');

// 11. full-session sends the transcript
T.disarm(null); T.arm('unl');
globalThis.__msgs.push({role:'assistant',content:'sixth'});
globalThis.sent.length=0; T.maybeRun();
const r4=globalThis.sent.filter(m=>m.op==='run')[0];
ok(r4 && typeof r4.ctx.transcript==='string' && r4.ctx.transcript.indexOf('CLAUDE: first reply')>=0,'full-session sends the transcript');
ok(r4 && r4.ctx.transcript.indexOf('HUMAN: hi')>=0,'transcript includes the human turns');


// 12. the stop button disarms, with nothing queued
T.disarm(null); T.arm('perf-skeptic');
globalThis.__tick();
globalThis.__qAutoState.count = 0;
globalThis.__ccStore().interrupt();
ok(S().armed===null,'stop button disarms even with an empty queue');
ok(S().stopped==='stopped by hand','stop reason recorded, got '+S().stopped);

// 13. max_turns ends the arming
T.disarm(null); T.arm('perf-skeptic');
for (var i=0;i<30;i++){
  globalThis.__msgs.push({role:'assistant',content:'reply '+i});
  globalThis.sent.length=0; T.maybeRun();
  var rr=globalThis.sent.filter(m=>m.op==='run')[0];
  if(!rr) break;
  globalThis.__onMsg({data:{type:'__ccaf',op:'result',rid:rr.rid,message:'q'+i,claims:[],stop:null}});
  T.approve();
}
ok(S().armed===null,'max_turns disarmed it');
ok(String(S().stopped).indexOf('max_turns')>=0,'max_turns reason: '+S().stopped);
ok(S().turns===20,'stopped at 20 turns, got '+S().turns);

// 14. the invalid flag reaches the slot
T.disarm(null); T.arm('perf-skeptic');
globalThis.__msgs.push({role:'assistant',content:'zzz'});
globalThis.sent.length=0; T.maybeRun();
var r5=globalThis.sent.filter(m=>m.op==='run')[0];
globalThis.__onMsg({data:{type:'__ccaf',op:'result',rid:r5.rid,message:'prose',why:'output was not JSON',claims:[],stop:null,invalid:true}});
ok(S().slot && S().slot.invalid===true,'invalid output is flagged on the slot');

// 15. a repeated claim is not recorded twice
T.disarm(null); T.arm('perf-skeptic');
globalThis.__msgs.push({role:'assistant',content:'dup test'});
globalThis.sent.length=0; T.maybeRun();
var r6=globalThis.sent.filter(m=>m.op==='run')[0];
var before=S().claims.length;
globalThis.__onMsg({data:{type:'__ccaf',op:'result',rid:r6.rid,message:'m',claims:['98.7 s prefill','98.7 s prefill','brand new'],stop:null}});
ok(S().claims.length===before+1,'repeated claim not recorded twice (added '+(S().claims.length-before)+')');

console.log('\n  '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
