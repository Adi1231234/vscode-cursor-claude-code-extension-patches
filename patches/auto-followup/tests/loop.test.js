require('./dom-stubs.js');
const fs=require('fs');
require('./load-panel.js').loadPanel(
  "{arm:arm,disarm:disarm,setPaused:setPaused,onHostMessage:onHostMessage,maybeRun:maybeRun,maybeSend:maybeSend,approve:approve,pendingOnce:pendingOnce,markOnceAsked:markOnceAsked,state:()=>({armed:armed,turns:turns,slot:slot,stopped:stopped,pending:pending,claims:readClaims(),autosend:autosend()})}");

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
globalThis.__msgs=[{role:'user',content:'hi'}];   /* nothing of Claude's to answer yet */
T.arm('perf-skeptic');
ok(S().armed==='perf-skeptic','armed');
ok(globalThis.__store['ccAfArmed:sess-1']==='perf-skeptic','arming persisted per session');

// 2. nothing to answer yet: the last thing in the conversation is your own
// message, so it waits - the same wait as before, for a different reason.
globalThis.sent.length=0;
T.maybeRun();
ok(!globalThis.sent.some(m=>m.op==='run'),'no run while the last message is the user own');

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

// 5. the result goes into the queue as an ordinary item, and the claims are
// recorded. It used to fill a lane of its own; the queue is where a person
// already edits, reorders and deletes what is about to be sent.
globalThis.__qItems.length=0;
globalThis.__onMsg({data:{type:'__ccaf',op:'result',rid:runs[0].rid,message:'was that proof?',why:'sameness claim',claims:['98.7 s prefill'],stop:null}});
ok(globalThis.__qItems.length===1,'the follow-up is queued, got '+globalThis.__qItems.length);
ok((globalThis.__qItems[0]||{}).text==='was that proof?','queued with the message it wrote');
ok((globalThis.__qItems[0]||{}).auto===true,'queued marked as written rather than typed');
ok(!S().slot,'and nothing is left in the lane');
ok(S().turns===1,'turn counted');
ok(S().claims.length===1 && S().claims[0].indexOf('98.7 s prefill')>0,'claim recorded: '+JSON.stringify(S().claims));
ok(S().claims[0].indexOf('[1]')===0,'claim numbered by turn');

// 6. autosend:false parks it skipped rather than holding it somewhere else:
// present in the queue, editable, one click from being sent.
ok((globalThis.__qItems[0]||{}).off===true,'autosend false parks it skipped');
ok(S().autosend===false,'and the responder still says ask first');

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
ok(r4 && typeof r4.ctx.transcript==='string' && r4.ctx.transcript.indexOf('CLAUDE: second reply, 98.7 seconds')>=0,'full-session sends the transcript');
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

// 14. an answer that did not parse is parked skipped whatever the responder
// says - it is the one case where what was written is not what was asked for.
T.disarm(null); T.arm('perf-skeptic');
globalThis.__msgs.push({role:'assistant',content:'zzz'});
globalThis.sent.length=0; globalThis.__qItems.length=0; T.maybeRun();
var r5=globalThis.sent.filter(m=>m.op==='run')[0];
globalThis.__onMsg({data:{type:'__ccaf',op:'result',rid:r5.rid,message:'prose',why:'output was not JSON',claims:[],stop:null,invalid:true}});
ok(globalThis.__qItems.length===1 && globalThis.__qItems[0].off===true,
   'an unparsed answer is queued skipped, got '+JSON.stringify(globalThis.__qItems));

// 15. a repeated claim is not recorded twice
T.disarm(null); T.arm('perf-skeptic');
globalThis.__msgs.push({role:'assistant',content:'dup test'});
globalThis.sent.length=0; T.maybeRun();
var r6=globalThis.sent.filter(m=>m.op==='run')[0];
var before=S().claims.length;
globalThis.__onMsg({data:{type:'__ccaf',op:'result',rid:r6.rid,message:'m',claims:['98.7 s prefill','98.7 s prefill','brand new'],stop:null}});
ok(S().claims.length===before+1,'repeated claim not recorded twice (added '+(S().claims.length-before)+')');


// '## once' - the panel decides WHEN, the responder file decides on what.
// Every one of these is a way the gate was got wrong at least once.
{
  const R={once:[{when:'[0-9]+ ?s([^a-z]|$)',ask:'ASK-DURATION'},
                 {when:'[0-9]+ ?%',ask:'ASK-FACTOR'}]};
  const P=T.pendingOnce;
  ok(P(R,'no numbers here')===null,'once: a message matching nothing pends nothing');
  ok(P(R,'prefill is 21 s').ask==='ASK-DURATION','once: fires on the pattern, not on the turn number');
  ok(P(R,'that is 12% faster').ask==='ASK-FACTOR','once: a later entry can fire first if it is what matched');
  // file order breaks a tie, so the entry a responder puts first is the one it gets
  ok(P(R,'21 s, which is 12% better').ask==='ASK-DURATION','once: file order breaks a tie');
  T.markOnceAsked(P(R,'21 s').id);
  ok(P(R,'still 21 s')===null,'once: an entry that has fired never fires again');
  ok(P(R,'21 s, which is 12% better').ask==='ASK-FACTOR','once: the next entry is still live after the first has fired');
  T.markOnceAsked(P(R,'12%').id);
  ok(P(R,'21 s and 12%')===null,'once: an exhausted list pends nothing');
  ok(P(null,'21 s')===null,'once: no responder pends nothing');
  ok(P({},'21 s')===null,'once: a responder with no once section pends nothing');
  // a bad pattern in one entry must not take the responder down with it
  ok(P({once:[{when:'([',ask:'bad'},{when:'21',ask:'good'}]},'21 s').ask==='good','once: an uncompilable pattern is skipped, not thrown');
  // the ledger is keyed by the question, so a different responder is not gagged by it
  ok(P({once:[{when:'21',ask:'ASK-DURATION'}]},'21 s')===null,'once: the same question stays asked across responders');
  ok(P({once:[{when:'21',ask:'ASK-DURATION, reworded'}]},'21 s')!==null,'once: editing a question re-arms it');
  ok(P({first_question:'FQ',once:[]},'anything').ask==='FQ','once: first_question still works for the simple case');
}
const F2=(()=>{const g={};(new Function('globalThis',fs.readFileSync(require('path').resolve(__dirname,'..','host','format.js'),'utf8')))(g);return g.__ccAfFormat;})();
globalThis.__ccAfSamples2=(()=>{const g={};(new Function('globalThis',fs.readFileSync(require('path').resolve(__dirname,'..','host','samples.js'),'utf8')))(g);return g.__ccAfSamples;})();

// 'after:' - an ordering between once-questions, not a sharper pattern.
{
  const P=T.pendingOnce;
  const R2={once:[{name:'frame',when:'[0-9]+ ?s([^a-z]|$)',ask:'A-FRAME'},
                  {name:'factor',after:'frame',when:'[0-9]+ ?%',ask:'A-FACTOR'}]};
  ok(P(R2,'that is 12% faster')===null,'after: a question waits for the one it depends on');
  ok(P(R2,'it takes 21 s').ask==='A-FRAME','after: the question depended on still fires');
  T.markOnceAsked(P(R2,'it takes 21 s').id);
  ok(P(R2,'that is 12% faster').ask==='A-FACTOR','after: and unblocks the one waiting');
  // a typo must cost the ordering, not the question
  const R3={once:[{name:'factor',after:'nosuch',when:'[0-9]+ ?%',ask:'A-ORPHAN'}]};
  ok(P(R3,'that is 12% faster').ask==='A-ORPHAN','after: naming an entry that does not exist blocks nothing');
  const R4={once:[{when:'[0-9]+ ?%',ask:'A-PLAIN'}]};
  ok(P(R4,'that is 12% faster').ask==='A-PLAIN','after: an entry without one is unaffected');
  const ps=F2.parse('perf-skeptic',globalThis.__ccAfSamples2.find(s=>s.id==='perf-skeptic').text);
  ok(ps.once[1].after==='frame','after: the shipped factor question waits for the frame question');
}

// Arming before the session has an id. A live panel lost its arming here and no
// unit test could see it: they all start from a session that already has one.
{
  const sidWas = globalThis.window.__qAuto.sid;
  globalThis.window.__qAuto.sid = () => '';        // no session yet
  globalThis.__tick();
  T.arm('perf-skeptic');
  ok(localStorage.getItem('ccAfArmed:none')==='perf-skeptic','carry: arming with no session stores under none');
  localStorage.setItem('ccAfClaims:none','["a claim"]');
  globalThis.window.__qAuto.sid = () => 'sess-new';   // the session appears
  globalThis.__tick();
  ok(S().armed==='perf-skeptic','carry: the arming survives the session getting its id');
  ok(localStorage.getItem('ccAfArmed:sess-new')==='perf-skeptic','carry: it moved to the real key');
  ok(localStorage.getItem('ccAfArmed:none')===null,'carry: and no longer sits under none');
  ok(localStorage.getItem('ccAfClaims:sess-new')==='["a claim"]','carry: the ledgers move with it');
  // A second real session id is NOT proof of a different conversation: a window
  // reload brings the same conversation back under a new one. Measured in a real
  // editor - armed under fbf2bf72, reloaded, same two messages on screen, panel
  // now calling itself c08c5113 - and that alone used to orphan the arming, the
  // ledger and the state. What tells the two apart is the transcript, so that is
  // what is asked. A different conversation on screen inherits nothing:
  localStorage.setItem('ccAfArmed:none','picky-reviewer');
  globalThis.__msgs=[{role:'user',content:'an entirely different chat'},
                     {role:'assistant',content:'a different first answer'}];
  globalThis.window.__qAuto.sid = () => 'sess-other';
  globalThis.__tick();
  ok(S().armed===null,'carry: a session showing a different conversation inherits nothing');
  ok(localStorage.getItem('ccAfArmed:none')==='picky-reviewer','carry: and nothing under none is consumed by it');
  // ...and the same conversation under a new id keeps its arming, which is the
  // whole point of surviving a reload (af/persist.js, reload.test.js).
  globalThis.__msgs=[{role:'user',content:'the original chat'},
                     {role:'assistant',content:'the original answer'}];
  globalThis.window.__qAuto.sid = () => 'sess-reloaded-a';
  globalThis.__tick();
  T.arm('perf-skeptic');
  globalThis.window.__qAuto.sid = () => 'sess-reloaded-b';
  globalThis.__tick();
  ok(S().armed==='perf-skeptic','carry: the same conversation under a new id keeps its arming');
  localStorage.removeItem('ccAfArmed:none');
  globalThis.window.__qAuto.sid = sidWas;
  globalThis.__tick();
}

// Pause: held by hand, still armed. The case is wanting to say something
// yourself for a turn or two without losing the count, the arming and the
// once-ledger, which is what turning it off costs.
{
  globalThis.__msgs=[{role:'user',content:'go'},{role:'assistant',content:'a first reply'}];
  T.arm('perf-skeptic');
  globalThis.sent.length=0;
  T.setPaused(true);
  globalThis.__msgs=[{role:'user',content:'go'},{role:'assistant',content:'a reply while paused'}];
  T.maybeRun();
  ok(!globalThis.sent.some(m=>m.op==='run'),'pause: no run is asked for while paused');
  ok(S().armed==='perf-skeptic','pause: and it is still armed');

  // resuming is a play too: what was said while it was held is answered as soon
  // as it comes back, with no message of yours needed to wake it up
  globalThis.sent.length=0;
  T.setPaused(false);
  T.maybeRun();
  ok(globalThis.sent.some(m=>m.op==='run'),'resume: the reply that arrived while paused is answered at once');

  // an approval already given is you, not the loop, so it still goes
  // a follow-up produced while it is held still goes into the queue - the queue
  // is where it waits, and the queue has its own pause. What a pause here stops
  // is the loop asking for another one.
  const rid=globalThis.sent.filter(m=>m.op==='run').pop().rid;
  globalThis.__qItems.length=0;
  globalThis.__onMsg({data:{type:'__ccaf',op:'result',rid:rid,message:'a follow-up',why:'w',claims:[],stop:null}});
  ok(globalThis.__qItems.length===1,'pause: the answer that was in flight still lands in the queue');
  T.setPaused(true);
  globalThis.sent.length=0;
  globalThis.__msgs=[{role:'user',content:'go'},{role:'assistant',content:'another reply while paused'}];
  T.maybeRun();
  ok(!globalThis.sent.some(m=>m.op==='run'),'pause: and no further run is asked for');
}


// Play means start now. Arming used to set lastSeen to whatever was on screen,
// so the loop did nothing until the next reply - which meant sending Claude a
// message yourself and waiting for it to finish before the thing you had just
// switched on did anything at all.
{
  T.disarm(null);
  globalThis.__msgs=[{role:'user',content:'go'},
                     {role:'assistant',content:'a reply that was already on screen'}];
  globalThis.sent.length=0;
  T.arm('perf-skeptic');
  T.maybeRun();
  const r=globalThis.sent.filter(m=>m.op==='run');
  ok(r.length===1,'play: arming answers the reply already on screen, got '+r.length);
  ok(r[0] && r[0].ctx.text==='a reply that was already on screen',
     'play: and it is that reply, got '+JSON.stringify(r[0]&&r[0].ctx.text));
  T.maybeRun();
  ok(globalThis.sent.filter(m=>m.op==='run').length===1,'play: and only once');
}

console.log('\n  '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
