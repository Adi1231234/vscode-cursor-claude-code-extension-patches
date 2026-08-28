/* The paths no other test executes: the button, the picker, the dialog, the lane,
   and the state races around them. Each runs inside a click handler or inside
   tick(), and tick() is wrapped in try/catch - so a throw here is silent and
   permanent rather than loud. That is exactly why they are tested. */
require('./dom-stubs.js');
const fs=require('fs'), path=require('path');
require('./load-panel.js').loadPanel(
  "{arm:arm,disarm:disarm,onHostMessage:onHostMessage,maybeRun:maybeRun,maybeSend:maybeSend,approve:approve,openDialog:openDialog,openLive:openLive,fitOverlay:fitOverlay,renderDialog:function(){return renderDialog();},toggleMenu:toggleMenu,ensureButton:ensureButton,renderLane:renderLane,saveDraft:saveDraft,deleteDraft:deleteDraft,selectDraft:selectDraft,dlg:function(){return dlg;},draft:function(){return draft;},menuNode:function(){return menuNode;},resume:resume,forgetStoppedId:function(){stoppedId=null;},btn:function(){return globalThis.__form.__afSlot;},state:function(){return {armed:armed,turns:turns,slot:slot,stopped:stopped,stoppedId:stoppedId,pending:pending,paused:paused,claims:readClaims()};}}");

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
for(const f of ['sections.js','format.js','samples.js'])
  (new Function('globalThis',fs.readFileSync(require('path').resolve(__dirname,'..','host',f),'utf8')))(HOSTG);
const asHostSends=(id)=>{
  const r=HOSTG.__ccAfFormat.parse(id,HOSTG.__ccAfSamples.find(s=>s.id===id).text);
  r.onceText=HOSTG.__ccAfFormat.onceToText(r.once);
  r.everyText=HOSTG.__ccAfFormat.everyToText(r.every);
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
ok(T.btn().__afCount==='0/50','counter shows the limit: '+T.btn().__afCount);
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

// A finished run has to have a way on. When the id was recorded there is one row
// naming it; when it was not - a run that ended under a build with no such field
// - the rows themselves are the only place that answer exists, so each one
// continues rather than arms, and the menu is never just Turn off.
{
  T.toggleMenu({currentTarget:T.btn()});
  globalThis.__onMsg({data:{type:'__ccaf',op:'list',items:LIST}});
  // one real turn first, because the count is what tells continuing from arming
  T.arm('perf-skeptic');
  globalThis.__msgs=[{role:'user',content:'go'},{role:'assistant',content:'it takes 21 s'}];
  globalThis.sent.length=0; T.maybeRun();
  const ask=globalThis.sent.filter(m=>m.op==='run').pop();
  globalThis.__onMsg({data:{type:'__ccaf',op:'result',rid:ask.rid,message:'q',claims:[],stop:null}});
  ok(S().turns===1,'done menu: one turn counted first, got '+S().turns);
  T.disarm('reached max_turns 20');
  T.toggleMenu({currentTarget:T.btn()});
  const why=document.querySelector('.__afMenuWhy');
  ok(why && /max_turns/.test(why.textContent),'done menu: the reason is at the top');
  const rows=()=>[...document.querySelectorAll('.__afMenu .__afItem')];
  // the stub textContent does not walk children, so read the row as a whole tree
  const deep=(n)=>{ let s=n.textContent||""; for(const c of (n.children||[])) s+=" "+deep(c); return s; };
  ok(rows().some(n=>/^Continue /.test(deep(n))),
     'done menu: one row names the responder that stopped');
  T.toggleMenu({currentTarget:T.btn()});

  T.forgetStoppedId();
  T.toggleMenu({currentTarget:T.btn()});
  ok(document.querySelector('.__afMenuWhy'),'no-id: the reason is still shown');
  const cont=rows().filter(n=>/continue this one/.test(deep(n)));
  ok(cont.length===LIST.length,'no-id: every responder row offers to continue, got '+cont.length);
  ok(!rows().some(n=>/^Continue /.test(deep(n).trim())),
     'no-id: and there is no row naming one, because nothing knows which');
  cont[0].dispatchEvent(new globalThis.MouseEvent("click",{bubbles:true}));
  ok(S().armed==='perf-skeptic','no-id: clicking a row continues that responder, got '+S().armed);
  ok(S().turns===1,
     'no-id: continuing keeps the count - arming would reset it, got '+S().turns);
  ok(S().stopped===null,'no-id: and the done state is gone');
  T.disarm(null);
}
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
/* The send race belongs to the fallback path: with a queue that takes the item
   there is nothing here that sends, and nothing to resurrect. Drop add() for
   this block so the lane is exercised, and put it back afterwards. */
const realAdd=globalThis.window.__qAuto.add; delete globalThis.window.__qAuto.add;
globalThis.__onMsg({data:{type:'__ccaf',op:'result',rid:r2.rid,message:'will fail',claims:[],stop:null}});
let resolveSend; globalThis.window.__qAuto.send=()=>new Promise(r=>{resolveSend=r;});
T.maybeSend();
ok(S().slot===null,'slot cleared while the send is in flight');
T.disarm('stopped by hand');
resolveSend(false);
globalThis.window.__qAuto.add=realAdd;
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
  const dlgBox = document.createElement('div');
  dlgBox._rect = {left:21,top:13,right:321,bottom:770,width:300,height:757};
  setting._rect = {left:172,top:422,right:312,bottom:469,width:140,height:47};
  setting._closest = dlgBox;
  keys(setting,'Enter');
  ok(!!q('.__afDrop'),'keys: Enter opens the dropdown');

  // The list belongs to the dialog, not to the panel. It used to be clamped to
  // the window, so at a narrow panel it ran out over the dialog's own header and
  // past both its edges. Geometry the stub can express: a 300-wide dialog at
  // x=21, a field low inside it, and a list too tall to open downward.
  {
    const box = {left:21,top:13,right:321,bottom:770,width:300,height:757};
    const dropped = q('.__afDrop');
    const setLeft = parseFloat(dropped.style.left), setTop = parseFloat(dropped.style.top);
    ok(setLeft >= box.left && setLeft + 200 <= box.right,
       'drop: the list stays inside the dialog horizontally, got left ' + setLeft);
    ok(setTop >= box.top && setTop + 120 <= box.bottom,
       'drop: and inside it vertically, got top ' + setTop);
    ok(dropped.style.minWidth === '140px',
       'drop: and is at least as wide as the field it opens under, got ' + dropped.style.minWidth);
    ok(parseFloat(dropped.style.maxWidth) <= box.width,
       'drop: and never wider than the dialog, got ' + dropped.style.maxWidth);
  }

  keys(document,'Escape');
  ok(!q('.__afDrop'),'layer: Escape closes the dropdown');
  ok(!!T.dlg(),'layer: and leaves the dialog open, with the edits still in it');

  keys(document,'Escape');
  ok(!T.dlg(),'layer: a second Escape closes the dialog');
  ok(!q('.__afDrop'),'layer: closing the dialog never leaves a dropdown behind it');

  T.openDialog(); T.selectDraft('perf-skeptic'); T.renderDialog();
  // max_turns takes any positive integer - maxTurns() has always parsed one -
  // so the list offers a row to type in rather than three presets and nothing else.
  {
    // the stub's textContent does not walk children, so ask the label itself
    const mt = () => [...document.querySelectorAll('.__afF')].find((n) =>
      [...n.children].some((c) => String(c.tagName).toLowerCase() === 'label' && c.textContent === 'max_turns'));
    ok(!!mt(), 'custom: the max_turns field is on the form');
    mt().click();
    const inp = q('.__afDCustom .__afDCIn');
    ok(!!inp, 'custom: max_turns offers a row to type a number into');
    ok(inp.value === '', 'custom: empty while one of the presets is the value');
    inp.value = 'abc';
    inp.dispatchEvent(new globalThis.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    ok(!!q('.__afDrop'), 'custom: a number that is not one does not close the list');
    inp.value = '7';
    inp.dispatchEvent(new globalThis.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    ok(T.draft().max_turns === '7',
       'custom: Enter sets the typed number, got ' + T.draft().max_turns);
    ok(!q('.__afDrop'), 'custom: and closes the list');

    mt().click();
    const back = q('.__afDCustom .__afDCIn');
    ok(back && back.value === '7',
       'custom: a number that is not a preset comes back in the row, got ' + (back || {}).value);
    ok(q('.__afDCustom').className.indexOf('__afDOn') > 0,
       'custom: and the row is the one marked as chosen');
    keys(document,'Escape');
  }

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

// The dialog edits the whole file. Two of its sections had no field at all, and
// survived only because serialize writes back what it was given - so a responder
// could be opened, saved, and still be showing half of itself. '## every' was
// the third: it saved correctly and was invisible, which is the same bug one
// step later.
{
  T.openDialog(); T.selectDraft('perf-skeptic'); T.renderDialog();
  const heads=[...document.querySelectorAll('.__afBoxHead')].map(e=>e.textContent);
  ok(heads.length===5,'sections: five boxes on the pane, got '+heads.length);
  const tas=[...document.querySelectorAll('.__afTa')];
  ok(tas.length===5,'sections: five text areas, got '+tas.length);
  ok(!!document.querySelector('.__afPair'),'sections: the two short ones share a row');
  ok(!!document.querySelector('.__afGrow'),'sections: the rules box still takes the room');

  const d=T.draft();
  ok(typeof d.onceText==='string','sections: the once chain arrives as editable text');
  ok(/name: backwards/.test(d.onceText),'sections: and carries the chain, got '+String(d.onceText).slice(0,20));
  ok(/name: five/.test(d.everyText),
     'sections: and the recurring ones, got '+String(d.everyText).slice(0,20));
  ok(!/## once|## every/.test(String(d.onceText)+String(d.everyText)),
     'sections: the editor shows the entries, not the heading above them');
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

// Where the follow-up is drawn. The queue panel is display:none whenever the
// queue is empty, and that is the only state this loop ever runs in - it refuses
// to run while the user has anything queued. Hosting the lane in a panel that is
// merely CONNECTED put every follow-up into a hidden box: the counter moved, the
// lane existed, and the screen showed nothing.
{
  const panel = document.createElement('div');
  panel.className = '__qPanel';
  document.body.appendChild(panel);
  const savedPanel = globalThis.window.__qAuto.panel;
  globalThis.window.__qAuto.panel = () => panel;

  /* This block is about the lane itself - where it mounts when the queue panel
     has no layout box - so it runs the fallback path deliberately. The queue
     path has no lane to place. */
  const keepAdd = globalThis.window.__qAuto.add;
  delete globalThis.window.__qAuto.add;
  T.disarm(null); T.arm('perf-skeptic');
  globalThis.__msgs = [{ role: 'user', content: 'go' },
                       { role: 'assistant', content: 'the live view turn: 31.4 s and a claim of sameness' }];
  T.maybeRun();
  const run = globalThis.sent.filter(m => m.op === 'run').pop();
  ok(!!run, 'lane: a run was requested');
  globalThis.__onMsg({ data: { type: '__ccaf', op: 'result', rid: run.rid,
                               message: 'and what does that cost?', why: 'a gain with no cost named', claims: [], stop: null } });
  ok(!!T.state().slot, 'lane: the answer became a message waiting to be sent');

  panel._shown = false;                       // the queue is empty, so the panel is display:none
  T.renderLane();
  const solo = document.querySelector('.__afSolo');
  ok(!!solo, 'lane: a panel with no layout box is not used - the lane gets a container of its own');
  ok(!!solo && !!solo.querySelector('.__afText'), 'lane: and the message is inside it');
  globalThis.window.__qAuto.add = keepAdd;

  panel._shown = true;                        // the user queues something; the panel is back
  T.renderLane();
  ok(!document.querySelector('.__afSolo'), 'lane: the spare container goes when the panel returns');

  globalThis.window.__qAuto.panel = savedPanel;
  T.disarm(null);
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

  /* The case the quotient cannot see. In the Electron VS Code 1.135 ships, a
     rect and an offsetHeight come back in the same units at every zoom, so the
     quotient is 1 and the overlay was sized as if there were no zoom - 768px
     under zoom 1.5 paints 1152 of a 783px panel, and a third of the dialog hung
     off the bottom. The zoom is read from the computed style now. */
  zoomBody(120, 120);            // the quotient says 1, as that engine does
  body.style.zoom = '1.5';
  T.fitOverlay();
  ok(ov.style.height === '520px',
     'zoom: a computed zoom of 1.5 is believed over a quotient of 1 (780/1.5), got ' + ov.style.height);
  ok(ov.style.width === (1040 / 1.5) + 'px',
     'zoom: and the width with it, got ' + ov.style.width);

  body.style.zoom = '';
  zoomBody(156, 120);            // no computed zoom, quotient 1.3: the fallback
  T.fitOverlay();
  ok(ov.style.height === '600px',
     'zoom: an engine that will not report zoom still gets the quotient, got ' + ov.style.height);

  document.documentElement.clientHeight = 800;
  document.documentElement.clientWidth = 1200;
}


// The list is the master and the pane is the detail; in a left-to-right interface
// the master goes on the left. It also puts the tab order in the order the eye
// travels - pick a responder, then edit it.
{
  T.openDialog(); T.selectDraft('perf-skeptic'); T.renderDialog();
  const body = document.querySelector('.__afDlgBody');
  const kids = body.children.map(n => String(n.className || '').split(/\s+/).filter(c => /__afList|__afEdit/.test(c))[0]).filter(Boolean);
  ok(kids.join(' ') === '__afList __afEdit',
     'rail: the list comes before the editor - got ' + kids.join(' '));

  const stops = [...document.querySelectorAll('.__afDlgBody [tabindex="0"], .__afDlgBody textarea, .__afDlgBody input')];
  const firstRail = stops.findIndex(e => String(e.className || '').indexOf('__afLItem') >= 0);
  const firstField = stops.findIndex(e => String(e.className || '').indexOf('__afIn') >= 0 || e.tagName === 'TEXTAREA');
  ok(firstRail >= 0 && firstField >= 0 && firstRail < firstField,
     'rail: a responder is reached before the fields it edits - rail at ' + firstRail + ', field at ' + firstField);
  T.openDialog();
}


// A section heading is two words and must never break across lines. The paired
// boxes get half the pane, and a flex row with no rules about who gives way
// breaks whatever is cheapest - which was "STOP" / "WHEN".
//
// The stub has no CSS engine, so asserting getComputedStyle here would only
// confirm a fake. What can be checked honestly is the rule that ships and the
// text it has to fit.
{
  const css = fs.readFileSync(require('path').resolve(__dirname, '..', 'followup.css'), 'utf8');
  const rule = (sel) => (css.split(sel + '{')[1] || '').split('}')[0];
  const head = rule('.__afBoxHead');
  ok(/white-space:nowrap/.test(head), 'heads: the heading is set never to wrap');
  const hint = rule('.__afBoxHead span');
  ok(/text-overflow:ellipsis/.test(hint) && /white-space:nowrap/.test(hint),
     'heads: the hint is the one that gives way');
  ok(/min-width:0/.test(hint), 'heads: and is allowed to shrink, or it cannot give way');

  T.openDialog(); T.selectDraft('perf-skeptic'); T.renderDialog();
  const paired = [...document.querySelectorAll('.__afPair .__afBoxHead span')].map(e => e.textContent);
  ok(paired.length === 2, 'heads: two boxes share the row, got ' + paired.length);
  ok(paired.every(t => t.length <= 28),
     'heads: their hints are written to fit half a pane - got ' + JSON.stringify(paired));
  T.openDialog();
}


// The first open after a reload. toggleMenu asks the host for the responders and
// builds the menu in the same breath, but the answer arrives in a message - so
// the menu was built against an empty list, said "No responders yet", and only a
// second open showed them.
{
  const items = () => {
    const m = document.querySelector('.__afMenu');
    return m ? [...m.querySelectorAll('.__afItem')].map(e => e.textContent.trim().slice(0, 20)) : null;
  };
  const emptyNote = () => !!document.querySelector('.__afMenu .__afEmpty');

  // start from nothing known, the way a freshly loaded panel does
  globalThis.__onMsg({ data: { type: '__ccaf', op: 'list', items: [] } });
  if (document.querySelector('.__afMenu')) T.toggleMenu({ currentTarget: T.btn() });
  T.toggleMenu({ currentTarget: T.btn() });
  ok(!!document.querySelector('.__afMenu'), 'firstopen: the picker opens');
  ok(emptyNote(), 'firstopen: with nothing known yet it says so');

  // the host answers a moment later
  globalThis.__onMsg({ data: { type: '__ccaf', op: 'list', items: LIST } });
  ok(!!document.querySelector('.__afMenu'), 'firstopen: the picker is still open');
  ok(!emptyNote(), 'firstopen: and no longer claims there is nothing');
  const got = items();
  ok(got && got.length >= LIST.length,
     'firstopen: the responders appear without a second click - got ' + JSON.stringify(got));
  T.toggleMenu({ currentTarget: T.btn() });
}


// The live view: what the responder is writing, while it writes it.
{
  /* An earlier block can leave the queue looking busy or a message still held,
     and maybeRun refuses in either case - so the preconditions are set here
     rather than inherited. */
  globalThis.__qAutoState.count = 0;
  globalThis.__qAutoState.busy = false;
  globalThis.__qAutoState.paused = false;
  T.disarm(null); T.arm('perf-skeptic');
  globalThis.__msgs = [{ role: 'user', content: 'go' }, { role: 'assistant', content: 'a finding, and 21 s' }];
  const beforeRuns = globalThis.sent.filter(m => m.op === 'run').length;
  T.maybeRun();
  const runs = globalThis.sent.filter(m => m.op === 'run');
  ok(runs.length === beforeRuns + 1, 'live: a run was requested by this block');
  ok(T.state().pending === true, 'live: and the loop is waiting for it');
  const run = runs[runs.length - 1];

  const chunk = (kind, text, rid) => globalThis.__onMsg({ data: { type: '__ccaf', op: 'chunk', rid: rid || run.rid, kind, text } });
  chunk('thinking', 'the number has no workload behind it');
  chunk('text', 'what real input ');
  chunk('text', 'was that measured on?');

  T.openLive();
  const segs = [...document.querySelectorAll('.__afSeg')];
  ok(segs.length === 2, 'live: consecutive deltas of one kind become one block, got ' + segs.length);
  ok(String(segs[0].className).indexOf('__afSegThink') >= 0, 'live: thinking first, as it arrived');
  ok(document.querySelector('.__afSegOut .__afSegText').textContent === 'what real input was that measured on?',
     'live: the text deltas are joined in order');
  ok(/writing/.test(document.querySelector('.__afLiveState').textContent),
     'live: it says it is still being written');

  // a chunk from another run must not bleed in
  chunk('text', 'FROM SOME OTHER RUN', 'someone-else:9');
  ok(document.body.innerText.indexOf('FROM SOME OTHER RUN') < 0,
     'live: a delta carrying another run id is ignored');

  // the answer lands
  globalThis.__onMsg({ data: { type: '__ccaf', op: 'result', rid: run.rid,
    message: 'what real input was that measured on?', why: 'a duration with no workload', claims: [], stop: null } });
  T.openLive(); T.openLive();   // toggle closed then open again
  ok(!!document.querySelector('.__afLiveDlg'), 'live: it reopens after the run has finished');
  ok(/approval|finished/.test(document.querySelector('.__afLiveState').textContent),
     'live: and it no longer claims to be writing, got ' + document.querySelector('.__afLiveState').textContent);

  // Escape closes it, and does not close the responders dialog behind it
  globalThis.document.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok(!document.querySelector('.__afLiveDlg'), 'live: Escape closes it');

  // a new run clears the view rather than appending to the last one
  T.maybeRun();
  const run2 = globalThis.sent.filter(m => m.op === 'run').pop();
  if (run2 && run2.rid !== run.rid) {
    T.openLive();
    ok(document.querySelectorAll('.__afSeg').length === 0,
       'live: a new run starts an empty view');
    T.openLive();
  }
  T.disarm(null);
}

// The clock. Measured against the real CLI, the first delta arrived 16.2 s into
// an 18.1 s run - so most of what this view shows is a wait, and a wait with no
// number on it reads as nothing happening.
{
  globalThis.__qAutoState.count = 0; globalThis.__qAutoState.busy = false; globalThis.__qAutoState.paused = false;
  T.disarm(null); T.arm('perf-skeptic');
  globalThis.__msgs = [{ role: 'user', content: 'go' },
                       { role: 'assistant', content: 'the clock turn: 44.1 s on the new path' }];
  T.maybeRun();
  const run = globalThis.sent.filter(m => m.op === 'run').pop();
  T.openLive();
  const count = () => document.querySelector('.__afLiveCount').textContent;
  ok(/\d+s$/.test(count()), 'clock: the header carries elapsed seconds, got ' + JSON.stringify(count()));
  ok(!/chars/.test(count()), 'clock: with nothing written yet it shows only the time, got ' + count());
  ok(/nothing written yet/.test(document.querySelector('.__afLiveEmpty').textContent),
     'clock: and says nothing has been written rather than looking empty');

  globalThis.__onMsg({ data: { type: '__ccaf', op: 'chunk', rid: run.rid, kind: 'text', text: 'on what input?' } });
  ok(/14 chars · \d+s/.test(count()), 'clock: once words arrive it shows both, got ' + count());

  T.openLive();   // closed
  ok(!document.querySelector('.__afLiveDlg'), 'clock: closing stops the view');
  T.disarm(null);

/* Pause is reached from the picker, which is the only menu the button opens, and
   the button has to say which of the two states it is in - a held loop that looks
   exactly like a running one is worse than no pause at all. */
{
  T.arm('perf-skeptic');
  const openPicker = () => {
    const m = document.querySelector('.__afMenu');
    if (m && m.parentNode) m.parentNode.removeChild(m);
    T.toggleMenu({ currentTarget: T.btn() });
    return [...document.querySelectorAll('.__afMenu .__afItem')];
  };
  let items = openPicker();
  const pause = items.find(n => n.textContent.trim() === 'Pause');
  ok(!!pause, 'pause: the picker offers it while armed');
  if (pause) pause.click();
  ok(S().paused === true, 'pause: clicking it holds the loop');
  T.ensureButton();
  ok((T.btn().className || '').indexOf('__afHold') >= 0,
     'pause: the button says so, got ' + T.btn().className);
  const tip = T.btn().querySelector('.__afTip');
  ok(!!tip && tip.textContent.indexOf('paused') > 0,
     'pause: and so does the tooltip, got ' + JSON.stringify(tip && tip.textContent));

  items = openPicker();
  const resume = items.find(n => n.textContent.trim() === 'Resume');
  ok(!!resume, 'pause: the same item reads Resume once it is held');
  if (resume) resume.click();
  ok(S().paused === false, 'resume: and it starts again');
  T.ensureButton();
  ok((T.btn().className || '').indexOf('__afOn') >= 0,
     'resume: the button goes back to armed, got ' + T.btn().className);

  /* Turning it off and arming again must not leave it held. */
  (openPicker().find(n => n.textContent.trim() === 'Pause') || { click() {} }).click();
  T.disarm(null);
  T.arm('perf-skeptic');
  ok(S().paused === false, 'pause: arming again starts running, not held');
}


/* Which build this window is running. Twice a change was applied, the window was
   reloaded and the old behaviour was still there - and nothing on screen could
   say whether the reload had missed this window or the change had missed the
   mark. The two need completely different work. */
{
  T.arm('perf-skeptic');
  T.ensureButton();
  const tip = () => (T.btn().querySelector('.__afTip') || {}).textContent || '';
  ok(tip().indexOf('newer build') < 0, 'build: nothing is said while the host says nothing');

  globalThis.__onMsg({ data: { type: '__ccaf', op: 'list', items: LIST,
    build: { running: 'A', onDisk: 'A', stale: false } } });
  T.ensureButton();
  ok(tip().indexOf('newer build') < 0, 'build: nor when the running build is the one on disk');

  globalThis.__onMsg({ data: { type: '__ccaf', op: 'list', items: LIST,
    build: { running: 'A', onDisk: 'B', stale: true } } });
  T.ensureButton();
  ok(tip().indexOf('newer build is installed, reload this window') > 0,
     'build: and says so when the bundle on disk is newer, got ' + JSON.stringify(tip()));
  ok(tip().indexOf('running A') > 0 && tip().indexOf('on disk B') > 0,
     'build: naming both, so the next question is answerable');
  ok(window.__ccBuild && window.__ccBuild.stale === true,
     'build: and a probe can read it without opening anything');

  globalThis.__onMsg({ data: { type: '__ccaf', op: 'list', items: LIST } });
  T.ensureButton();
  ok(tip().indexOf('newer build') > 0,
     'build: a list without the field does not silently clear a warning that is true');
}


/* The picker is one click deep, and two of those clicks throw work away while a
   loop is running: another responder restarts the count and the once-ledger, and
   turning it off does that and kills a run in flight. Neither is recoverable. */
{
  /* Removing the node does not clear the script own menuNode, so the first call
     can be read as "close". Ask again when nothing opened - an earlier version of
     this helper silently returned an empty list and the block died inside a
     setTimeout the stub swallows. */
  const openPicker = () => {
    const m = document.querySelector(".__afMenu");
    if (m && m.parentNode) m.parentNode.removeChild(m);
    T.toggleMenu({ currentTarget: T.btn() });
    if (!document.querySelector(".__afMenu")) T.toggleMenu({ currentTarget: T.btn() });
    return [...document.querySelectorAll(".__afMenu .__afItem")];
  };
  /* Two responders, put there by this block: what the picker holds by now is
     whatever the blocks above left in it. */
  globalThis.__onMsg({ data: { type: '__ccaf', op: 'list', items: LIST } });
  /* A responder row keeps its name in a nested element, and the stub textContent
     does not walk children - matching on it found every row empty. */
  const deepText = (n) => [(n._text || ""), ...[...(n.children || [])].map(deepText)].join(" ");
  const pick = (name) => openPicker().find((it) => deepText(it).indexOf(name) >= 0);
  const confirmBox = () => document.querySelector('.__afConfirm');
  const clickIn = (box, label) => {
    const b = [...box.querySelectorAll('.__afB')].find(n => n.textContent.trim() === label);
    if (b) b.click();
    return !!b;
  };

  /* nothing armed: no question, it just arms */
  T.disarm(null);
  pick('perf-skeptic').click();
  ok(!confirmBox(), 'confirm: arming from nothing does not ask');
  ok(S().armed === 'perf-skeptic', 'confirm: and it armed');

  /* armed: switching asks first, and does not switch until it is answered */
  pick('unl').click();
  ok(!!confirmBox(), 'confirm: switching while armed asks first');
  ok(S().armed === 'perf-skeptic', 'confirm: and nothing changed while it asks');
  ok(deepText(confirmBox()).indexOf('unl') > 0,
     'confirm: it names what would replace it');
  ok(clickIn(confirmBox(), 'Cancel'), 'confirm: Cancel is offered');
  ok(!confirmBox(), 'confirm: cancelling closes it');
  ok(S().armed === 'perf-skeptic', 'confirm: and leaves the arming alone');

  pick('unl').click();
  clickIn(confirmBox(), 'Switch');
  ok(!confirmBox(), 'confirm: confirming closes it');
  ok(S().armed === 'unl', 'confirm: and switches, got ' + S().armed);

  /* Turn off asks too, and Escape is a cancel */
  pick('Turn off').click();
  ok(!!confirmBox(), 'confirm: Turn off asks while armed');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  ok(!confirmBox(), 'confirm: Escape closes it');
  ok(S().armed === 'unl', 'confirm: and does not turn it off');

  pick('Turn off').click();
  clickIn(confirmBox(), 'Turn off');
  ok(S().armed === null, 'confirm: confirming turns it off');

  /* Pause changes nothing that cannot be undone, so it never asks */
  T.arm('perf-skeptic');
  (pick('Pause') || { click() {} }).click();
  ok(!confirmBox(), 'confirm: pausing does not ask');
  ok(S().paused === true, 'confirm: it just pauses');
}


/* What the live view shows. The model streams the JSON the contract asks for, so
   the raw text is braces and escapes with the sentence that matters buried in the
   middle - which is what it used to put on screen. */
{
  T.disarm(null); T.arm('perf-skeptic');
  globalThis.__msgs = [{ role: 'user', content: 'go' },
                       { role: 'assistant', content: 'a claim of sameness and 21 s' }];
  globalThis.sent.length = 0;
  T.maybeRun();
  const run = globalThis.sent.filter((m) => m.op === 'run').pop();
  const chunk = (kind, text) => globalThis.__onMsg({ data: { type: '__ccaf', op: 'chunk',
    rid: run.rid, kind, text } });
  const segs = () => [...document.querySelectorAll('.__afSeg')].map((s) => ({
    tag: (s.querySelector('.__afSegTag') || {}).textContent,
    text: (s.querySelector('.__afSegText') || {}).textContent }));

  /* half of the JSON, cut inside the message the way a stream cuts it */
  chunk('text', '{' + '"' + 'message' + '"' + ': ' + '"' + 'on how many inputs');
  T.openLive();
  let s = segs();
  ok(s.length === 1, 'live: one block while only the message has started, got ' + s.length);
  /* No label on the message - it is the only prose in the box and a tag over it
     would be a caption on a photograph of itself. That it is still being written
     is said by the header state, the pulse, the sweeping hairline, and an accent
     rule down the side of the text. The rule is what this asserts. */
  ok(!!document.querySelector('.__afSegWriting'),
     'live: the message is marked as still being written');
  ok(s[0].text === 'on how many inputs',
     'live: showing the value, not the JSON around it, got ' + JSON.stringify(s[0].text));

  /* the rest of it, and the result the host parsed out */
  chunk('text', '?' + '"' + ', ' + '"' + 'why' + '"' + ': ' + '"' + 'a sameness claim' + '"' + '}');
  globalThis.__onMsg({ data: { type: '__ccaf', op: 'result', rid: run.rid,
    message: 'on how many inputs?', why: 'a sameness claim with no count',
    claims: ['28.0 s to 21.8 s on one file'], stop: null } });
  s = segs();
  ok(!!document.querySelector('.__afSegMsg') &&
     document.querySelector('.__afSegMsg .__afSegText').textContent === 'on how many inputs?',
     'live: the finished message is the message block, got ' + JSON.stringify(s));
  ok(!document.querySelector('.__afSegWriting'),
     'live: and the in-progress rule is gone once it has landed');
  ok(s.some((x) => x.tag === 'why this move'), 'live: with why the move was picked');
  ok(!!document.querySelector('.__afClaimList li'), 'live: and the claims as a list');
  ok(document.querySelector('.__afClaimList li').textContent.indexOf('28.0 s') >= 0,
     'live: with the claim in it');
  ok(!document.querySelector('.__afSegRaw'), 'live: the raw stream is not shown by default');

  const toggle = document.querySelector('.__afRawToggle');
  ok(!!toggle, 'live: but there is a way to see it');
  toggle.click();
  ok(!!document.querySelector('.__afSegRaw') &&
     document.querySelector('.__afSegRaw .__afSegText').textContent.indexOf('message') > 0,
     'live: and clicking it shows what the model actually wrote');
  T.openLive();   /* close */
}

}
  console.log(String.fromCharCode(10)+'  '+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
},0);
