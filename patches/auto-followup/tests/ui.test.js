/* The paths no other test executes: the button, the picker, the dialog, the lane,
   and the state races around them. Each runs inside a click handler or inside
   tick(), and tick() is wrapped in try/catch - so a throw here is silent and
   permanent rather than loud. That is exactly why they are tested. */
require('./dom-stubs.js');
const fs=require('fs'), path=require('path');
const B=path.resolve(__dirname,'..','af')+'/';
const order=JSON.parse(require('fs').readFileSync(B+'order.json','utf8'));
const LIBROW=require('path').resolve(__dirname,'..','..','..','lib','js','ccRow.js');
eval(fs.readFileSync(LIBROW,'utf8'));
let src=order.map(f=>fs.readFileSync(B+f+'.js','utf8')).join('')
  .split(String.fromCharCode(13)+String.fromCharCode(10)).join(String.fromCharCode(10));
src=src.split('/* AUTOFOLLOWUP */').join('').split('</scr'+'ipt>').join('');
src=src.replace(/^[\s\S]*?\(function\(\)\{/,'(function(){');
src=src.split('__MSG__').join('message_X').split('__USERMSG__').join('userMessage_X')
         .split('__THINK__').join('thinking_X').split('__TOOLUSE__').join('toolUse_X')
         .split('__TOOLRES__').join('toolResult_X');
src=src.replace('  requestList();'+String.fromCharCode(10)+'  setInterval(',
 '  globalThis.__t={arm:arm,disarm:disarm,onHostMessage:onHostMessage,maybeRun:maybeRun,maybeSend:maybeSend,'+
 'approve:approve,openDialog:openDialog,fitOverlay:fitOverlay,renderDialog:function(){return renderDialog();},toggleMenu:toggleMenu,'+
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
/* The responder list as the host really sends it: parsed by format.js from the
   shipped sample, with the same derived fields store.js adds. It used to be a
   hand-written object, and a hand-written fixture only ever contains the fields
   whoever wrote it remembered - the goal and the once chain were both missing,
   so three tests passed against a responder that could not exist. */
const HOSTG={};
for(const f of ['format.js','samples.js'])
  (new Function('globalThis',fs.readFileSync(require('path').resolve(__dirname,'..','host',f),'utf8')))(HOSTG);
const asHostSends=(id)=>{
  const r=HOSTG.__ccAfFormat.parse(id,HOSTG.__ccAfSamples.find(s=>s.id===id).text);
  r.onceText=HOSTG.__ccAfFormat.onceToText(r.once);
  return r;
};
const LIST=[asHostSends('perf-skeptic'),
  Object.assign(asHostSends('plan-drift'),{id:'unl',name:'unl',max_turns:'unlimited',autosend:'true',model:'opus'})];

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

// Layering and the keyboard. Both of these were found by driving a real panel:
// every control in the dialog was a div with a click handler, so none of it was
// reachable without a mouse, and Escape took the dialog out from under an open
// dropdown - discarding the edits and leaving the dropdown on screen with
// nothing behind it.
try{
  T.openDialog(); T.selectDraft('perf-skeptic'); T.renderDialog();
  const q=(s)=>document.querySelector(s);
  const keys=(el,key)=>el.dispatchEvent(new globalThis.KeyboardEvent('keydown',{key:key,bubbles:true}));

  const setting=q('.__afF');
  ok(!!setting,'keys: a setting is rendered');
  ok(setting.getAttribute('tabindex')==='0','keys: a setting is a tab stop');
  ok(setting.getAttribute('role')==='button','keys: and announces itself as a control');
  keys(setting,'Enter');
  ok(!!q('.__afDrop'),'keys: Enter opens the dropdown');

  keys(document,'Escape');
  ok(!q('.__afDrop'),'layer: Escape closes the dropdown');
  ok(!!T.dlg(),'layer: and leaves the dialog open, with the edits still in it');

  keys(document,'Escape');
  ok(!T.dlg(),'layer: a second Escape closes the dialog');
  ok(!q('.__afDrop'),'layer: closing the dialog never leaves a dropdown behind it');

  T.openDialog(); T.selectDraft('perf-skeptic'); T.renderDialog();
  const item=q('.__afLItem');
  ok(item.getAttribute('tabindex')==='0','keys: a responder in the rail is a tab stop');
  const add=[...document.querySelectorAll('.__afNew')][0];
  ok(add && add.getAttribute('tabindex')==='0','keys: so is + New responder');
  ok(q('.__afX').getAttribute('aria-label')==='Close','keys: the close control has a name');
  const stops=document.querySelectorAll('.__afDlg [tabindex="0"], .__afDlg button, .__afDlg textarea, .__afDlg input');
  ok(stops.length>=12,'keys: every control is reachable, got '+stops.length);
  T.openDialog();
}catch(e){ fail++; console.log('  THREW in keyboard block: '+e.message); }

// The dialog edits the whole file. Two of its four sections had no field at all,
// and survived only because serialize writes back what it was given - so a
// responder could be opened, saved, and still be showing half of itself.
{
  T.openDialog(); T.selectDraft('perf-skeptic'); T.renderDialog();
  const heads=[...document.querySelectorAll('.__afBoxHead')].map(e=>e.textContent);
  ok(heads.length===4,'sections: four boxes on the pane, got '+heads.length);
  const tas=[...document.querySelectorAll('.__afTa')];
  ok(tas.length===4,'sections: four text areas, got '+tas.length);
  ok(!!document.querySelector('.__afPair'),'sections: the two short ones share a row');
  ok(!!document.querySelector('.__afGrow'),'sections: the rules box still takes the room');

  const d=T.draft();
  ok(typeof d.onceText==='string','sections: the once chain arrives as editable text');
  ok(/name: frame/.test(d.onceText),'sections: and carries the chain, got '+String(d.onceText).slice(0,20));
  ok(typeof d.goal==='string' && d.goal.length>0,'sections: the goal arrives too');

  // saving hands the text back; the host parses it, so a bad pattern never
  // reaches the loop as an object nobody checked
  d.onceText='name: a'+String.fromCharCode(10)+'when: [0-9]'+String.fromCharCode(10)+'ask: how many?';
  T.saveDraft();
  const sent=globalThis.sent.filter(m=>m.op==='save').pop();
  ok(sent && sent.responder && sent.responder.onceText.indexOf('how many?')>=0,
     'sections: the edited once text reaches the host');

  T.openDialog(); T.selectDraft('perf-skeptic'); T.renderDialog();
  const save=[...document.querySelectorAll('.__afFoot button')].pop();
  ok(save.textContent==='Saved','dirty: an untouched draft says Saved, got '+save.textContent);
  const ta=document.querySelectorAll('.__afTa')[1];
  ta.value='changed'; (ta.listeners.input||[]).forEach(f=>f({}));
  T.renderDialog();
  const save2=[...document.querySelectorAll('.__afFoot button')].pop();
  ok(save2.textContent==='Save','dirty: an edited draft says Save, got '+save2.textContent);
  ok(String(save2.className).indexOf('__afDirty')>=0,'dirty: and is marked as such');
  T.openDialog();
}

// Two patches, one slot. background-tasks' indicator anchors with the same rule
// this button used - "be the element immediately before .__qAdd" - and only one
// element can be, so each timer displaced the other about three times a second.
//
// The shared form fixture cannot show this: it overrides querySelector and
// insertBefore with stand-ins that record the node and ignore ordering, which is
// exactly the mechanism under test. So this builds a real one.
{
  const realForm = (kids) => {
    const f = document.createElement('form');
    for (const c of kids) { const e = document.createElement('button'); e.className = c; f.appendChild(e); }
    const input = document.createElement('div');
    input.closest = () => f;
    globalThis.__ccInput = () => input;
    return f;
  };
  const order = (f) => f.children.map(n => String(n.className || '').split(/\s+/)[0]).join(' ');
  const savedInput = globalThis.__ccInput;

  // prompt-queue and background-tasks register these when they are installed
  globalThis.window.__ccRow.rank('__qLog', 20);
  globalThis.window.__ccRow.rank('__bgInd', 30);
  globalThis.window.__ccRow.rank('__qAdd', 40);

  let f = realForm(['__bgInd', '__qAdd', 'sendButton_X']);
  T.ensureButton();
  ok(order(f) === '__afBtn __bgInd __qAdd sendButton_X',
     'anchor: the shared order puts it first in the row - got ' + order(f));

  const settled = order(f);
  T.ensureButton(); T.ensureButton(); T.ensureButton();
  ok(order(f) === settled, 'anchor: three more passes move nothing - got ' + order(f));

  f = realForm(['__qAdd', 'sendButton_X']);
  T.ensureButton();
  ok(order(f) === '__afBtn __qAdd sendButton_X',
     'anchor: with no indicator it sits before the add button - got ' + order(f));
  T.ensureButton();
  ok(order(f) === '__afBtn __qAdd sendButton_X', 'anchor: and stays there - got ' + order(f));

  // the indicator appearing later must not shift this button either
  f.insertBefore(Object.assign(document.createElement('button'), { className: '__bgInd' }),
                 f.children.find(n => n.className === '__qAdd'));
  T.ensureButton(); T.ensureButton();
  ok(order(f) === '__afBtn __bgInd __qAdd sendButton_X',
     'anchor: an indicator appearing later takes its own rank - got ' + order(f));

  // The whole point: once the row is in rank order, further passes write nothing.
  // The old rule wrote on every pass forever whenever a second patch was present.
  f = realForm(['__bgInd', '__qLog', '__qAdd', 'sendButton_X']);
  T.ensureButton();
  ok(order(f) === '__afBtn __qLog __bgInd __qAdd sendButton_X',
     'anchor: three injected buttons land in rank order - got ' + order(f));
  const real = f.insertBefore.bind(f);
  let writes = 0;
  f.insertBefore = (n, r) => { writes++; return real(n, r); };
  for (let i = 0; i < 20; i++) T.ensureButton();
  ok(writes === 0, 'anchor: twenty further passes write nothing at all - got ' + writes + ' writes');
  ok(order(f) === '__afBtn __qLog __bgInd __qAdd sendButton_X', 'anchor: and the order holds');

  globalThis.__ccInput = savedInput;
}

// A zoomed ancestor becomes the containing block for a fixed element, so inset:0
// stops meaning the viewport - and vh inside that subtree renders at vh times the
// zoom. Measured at zoom 1.3 in a live panel: the dialog sat at top -51 with its
// header and its buttons both off the screen.
{
  const body = globalThis.document.body;
  const zoomBody = (screenPx, ownPx) => {
    Object.defineProperty(body, 'getBoundingClientRect', { configurable: true,
      value: () => ({ top: 0, bottom: screenPx, left: 0, width: 1040, height: screenPx }) });
    Object.defineProperty(body, 'offsetHeight', { configurable: true, value: ownPx });
  };
  document.documentElement.clientHeight = 780;
  document.documentElement.clientWidth = 1040;

  zoomBody(156, 120);            // 1.3x
  T.openDialog();
  const ov = document.querySelector('.__afOverlay');
  ok(!!ov, 'zoom: the overlay exists');
  ok(ov.style.height === '600px',
     'zoom: opening the dialog sizes the overlay to the screen in its own units (780/1.3), got ' + JSON.stringify(ov.style.height));
  ok(ov.style.width === '800px', 'zoom: and the width the same way, got ' + ov.style.width);

  zoomBody(120, 120);            // no zoom
  T.fitOverlay();
  ok(ov.style.height === '780px', 'zoom: with no zoom it is just the screen height, got ' + ov.style.height);

  zoomBody(0, 0);                // a degenerate measurement must not blank the dialog
  T.fitOverlay();
  ok(ov.style.height === '780px', 'zoom: a zero measurement falls back to scale 1, got ' + ov.style.height);

  document.documentElement.clientHeight = 800;
  document.documentElement.clientWidth = 1200;
}
  console.log(String.fromCharCode(10)+'  '+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
},0);
