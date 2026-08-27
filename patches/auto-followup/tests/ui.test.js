/* The paths no other test executes: the button, the picker, the dialog, the lane,
   and the state races around them. Each runs inside a click handler or inside
   tick(), and tick() is wrapped in try/catch - so a throw here is silent and
   permanent rather than loud. That is exactly why they are tested. */
require('./dom-stubs.js');
const fs=require('fs'), path=require('path');
const B=path.resolve(__dirname,'..','af')+'/';
const order=JSON.parse(require('fs').readFileSync(B+'order.json','utf8'));
let src=order.map(f=>fs.readFileSync(B+f+'.js','utf8')).join('');
src=src.split('/* AUTOFOLLOWUP */').join('').split('</scr'+'ipt>').join('');
src=src.replace(/^[\s\S]*?\(function\(\)\{/,'(function(){');
src=src.split('__MSG__').join('message_X').split('__USERMSG__').join('userMessage_X')
         .split('__THINK__').join('thinking_X').split('__TOOLUSE__').join('toolUse_X')
         .split('__TOOLRES__').join('toolResult_X');
src=src.replace('  requestList();'+String.fromCharCode(10)+'  setInterval(',
 '  globalThis.__t={arm:arm,disarm:disarm,onHostMessage:onHostMessage,maybeRun:maybeRun,maybeSend:maybeSend,'+
 'approve:approve,openDialog:openDialog,renderDialog:function(){return renderDialog();},toggleMenu:toggleMenu,'+
 'ensureButton:ensureButton,renderLane:renderLane,saveDraft:saveDraft,deleteDraft:deleteDraft,selectDraft:selectDraft,'+
 'dlg:function(){return dlg;},draft:function(){return draft;},menuNode:function(){return menuNode;},'+
 'btn:function(){return globalThis.__form.__afSlot;},'+
 'state:function(){return {armed:armed,turns:turns,slot:slot,stopped:stopped,pending:pending,claims:readClaims()};}};'
 +String.fromCharCode(10)+'  requestList();'+String.fromCharCode(10)+'  setInterval(');
eval(src);

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};
const run=(m,f)=>{ try{ f(); pass++; } catch(e){ fail++; console.log('  THREW: '+m+' -> '+e.message); } };
const T=globalThis.__t, S=()=>T.state();
const LIST=[
  {id:'perf-skeptic',name:'perf-skeptic',description:'d',context:'last-message+claims',max_turns:'20',autosend:'false',model:'sonnet',rules:'r',stop:'s'},
  {id:'unl',name:'unl',description:'',context:'full-session',max_turns:'unlimited',autosend:'true',model:'opus',rules:'r',stop:'s'}];

globalThis.__tick();
globalThis.__onMsg({data:{type:'__ccaf',op:'list',items:LIST}});

run('ensureButton while off', ()=>T.ensureButton());
ok(T.btn(), 'button inserted into the composer');
ok(T.btn().className==='__afBtn','off state class: '+T.btn().className);
T.arm('perf-skeptic'); run('ensureButton while armed', ()=>T.ensureButton());
ok(T.btn().className.indexOf('__afOn')>=0,'armed class: '+T.btn().className);
ok(T.btn().__afCount==='0/20','counter shows the limit: '+T.btn().__afCount);
T.disarm('a reason'); run('ensureButton while finished', ()=>T.ensureButton());
ok(T.btn().className.indexOf('__afDone')>=0,'finished class: '+T.btn().className);
ok(String(T.btn().__afCount).indexOf('done')>=0,'finished chip: '+T.btn().__afCount);
T.arm('unl'); T.ensureButton();
ok(T.btn().__afCount==='0','unlimited shows a bare count: '+T.btn().__afCount);

run('toggleMenu opens', ()=>T.toggleMenu({currentTarget:T.btn()}));
ok(T.menuNode(),'menu opened');
run('toggleMenu closes', ()=>T.toggleMenu({currentTarget:T.btn()}));
ok(!T.menuNode(),'menu closed');
globalThis.__onMsg({data:{type:'__ccaf',op:'list',items:[]}});
run('menu with no responders', ()=>T.toggleMenu({currentTarget:T.btn()}));
ok(T.menuNode(),'menu opens with an empty list');
T.toggleMenu({currentTarget:T.btn()});
globalThis.__onMsg({data:{type:'__ccaf',op:'list',items:LIST}});

run('openDialog', ()=>T.openDialog());
ok(T.dlg(),'dialog opened');
ok(T.draft() && T.draft().id,'a draft is selected');
run('renderDialog again', ()=>T.renderDialog());
run('selectDraft(new)', ()=>T.selectDraft(null));
ok(T.draft().isNew===true,'new draft flagged');
run('renderDialog with a new draft', ()=>T.renderDialog());
run('selectDraft(existing)', ()=>T.selectDraft('unl'));
ok(T.draft().max_turns==='unlimited','unlimited draft loaded');
run('saveDraft', ()=>T.saveDraft());
ok(globalThis.sent.some(m=>m.op==='save'),'save reached the host');

T.disarm(null); T.arm('perf-skeptic');
T.openDialog(); T.selectDraft('perf-skeptic');
T.draft().max_turns='7'; T.saveDraft(); T.ensureButton();
ok(T.btn().__afCount==='0/7','an edit to the armed responder reaches the counter: '+T.btn().__afCount);

T.openDialog(); T.selectDraft('perf-skeptic');
run('deleteDraft', ()=>T.deleteDraft());
ok(S().armed===null,'deleting the armed responder disarms it');
ok(globalThis.sent.some(m=>m.op==='delete'),'delete reached the host');

globalThis.__onMsg({data:{type:'__ccaf',op:'list',items:LIST}});
T.arm('perf-skeptic');
run('renderLane with nothing pending', ()=>T.renderLane());
globalThis.__msgs=[{role:'assistant',content:'a reply'}];
T.maybeRun();
run('renderLane while pending', ()=>T.renderLane());
const rr=globalThis.sent.filter(m=>m.op==='run').pop();
globalThis.__onMsg({data:{type:'__ccaf',op:'result',rid:rr.rid,message:'m',why:'w',claims:[],stop:null}});
run('renderLane with a held slot', ()=>T.renderLane());
globalThis.__qAutoState.paused=true;  run('renderLane while paused', ()=>T.renderLane());
globalThis.__qAutoState.paused=false;
globalThis.__qAutoState.count=3;      run('renderLane while the queue has items', ()=>T.renderLane());
globalThis.__qAutoState.count=0;

globalThis.__onMsg({data:{type:'__ccaf',op:'list',items:[LIST[1]]}});
ok(S().armed===null,'an arming whose file vanished is disarmed');
ok(String(S().stopped).indexOf('gone')>=0,'and says why: '+S().stopped);

globalThis.__onMsg({data:{type:'__ccaf',op:'list',items:LIST}});
T.arm('unl');
globalThis.__msgs=[{role:'assistant',content:'another reply'}];
globalThis.sent.length=0; T.maybeRun();
const r2=globalThis.sent.filter(m=>m.op==='run')[0];
globalThis.__onMsg({data:{type:'__ccaf',op:'result',rid:r2.rid,message:'will fail',claims:[],stop:null}});
let resolveSend; globalThis.window.__qAuto.send=()=>new Promise(r=>{resolveSend=r;});
T.maybeSend();
ok(S().slot===null,'slot cleared while the send is in flight');
T.disarm('stopped by hand');
resolveSend(false);
globalThis.setTimeout(function(){
  ok(S().slot===null,'a failed send does not resurrect the slot after a disarm');
  console.log(String.fromCharCode(10)+'  '+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
},0);
