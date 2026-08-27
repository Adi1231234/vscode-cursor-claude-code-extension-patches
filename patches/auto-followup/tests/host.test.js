const fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm');
const NL = String.fromCharCode(10);
const base=require('path').resolve(__dirname,'..','host')+'/';
// isolated responders dir
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'afcfg-'));
process.env.CLAUDE_CONFIG_DIR=dir;
for(const f of ['format.js','store.js','samples.js','prompt.js','run.js','handle.js']) eval(fs.readFileSync(base+f,'utf8'));
const S=globalThis.__ccAfStore, F=globalThis.__ccAfFormat, R=globalThis.__ccAfRun;
let pass=0,fail=0;
const ok=(c,m)=>{ c?pass++:(fail++,console.log('  FAIL: '+m)); };

// 1. seeding
ok(S.list().length===0,'empty before seed');
S.seedIfEmpty(globalThis.__ccAfSamples);
const l=S.list();
ok(l.length===3,'seeded 3, got '+l.length);
ok(l.map(r=>r.id).sort().join(',')==='perf-skeptic,picky-reviewer,plan-drift','sample ids: '+l.map(r=>r.id));
// 2. seeding is once
S.seedIfEmpty(globalThis.__ccAfSamples);
ok(S.list().length===3,'seed is idempotent');
// 3. fields parsed
const p=S.read('perf-skeptic');
ok(p && p.context==='last-message+claims','context parsed: '+(p&&p.context));
ok(p && p.max_turns==='20','max_turns parsed: '+(p&&p.max_turns));
ok(p && p.autosend==='false','autosend parsed');
ok(p && p.rules.length>50,'rules body parsed ('+(p?p.rules.length:0)+' ch)');
ok(p && p.stop.length>20,'stop body parsed ('+(p?p.stop.length:0)+' ch)');
ok(p && p.rules.indexOf('## stop')<0,'rules does not swallow the stop section');
// 4. round trip + unknown keys preserved
const raw=F.serialize(Object.assign({},p,{extra:{custom_thing:'kept'}}));
const back=F.parse('perf-skeptic',raw);
ok(back.rules===p.rules && back.stop===p.stop,'round-trip body identical');
ok(back.extra.custom_thing==='kept','unknown front-matter key preserved');
ok(back.context===p.context && back.model===p.model,'round-trip fields identical');
// 5. forgiving parser
const bare=F.parse('x','just do the thing');
ok(bare.rules==='just do the thing','no-heading file becomes rules');
ok(bare.max_turns==='20' && bare.context==='last-message+claims','defaults applied');
// 6. save / delete
ok(S.save({id:'tmp-one',name:'Tmp',description:'d',context:'full-session',max_turns:'unlimited',autosend:'true',model:'opus',rules:'r',stop:'s',extra:{}}),'save returns true');
const t=S.read('tmp-one');
ok(t && t.max_turns==='unlimited' && t.autosend==='true' && t.context==='full-session','saved fields read back');
ok(S.remove('tmp-one') && S.read('tmp-one')===null,'delete works');
// 7. path traversal refused
ok(S.save({id:'../evil',rules:'x'})===false,'traversal id refused');
ok(S.save({id:'a/b',rules:'x'})===false,'slash id refused');
ok(S.read('../../etc/passwd')===null,'traversal read refused');

// 8. line endings and stray bytes - these files are hand-edited on Windows, and
//    git rewrites them to CRLF on checkout even though serialize() writes LF.
const NLc = String.fromCharCode(10), CRc = String.fromCharCode(13), BOMc = String.fromCharCode(0xFEFF);
const LFfile = ['---','name: n','description: d','context: full-session','max_turns: 5',
                'autosend: true','model: opus','---','','## rules','RULE','','## stop','STOP',''].join(NLc);
const CRLFfile = LFfile.split(NLc).join(CRc + NLc);
const cr = F.parse('x', CRLFfile);
ok(cr.name==='n' && cr.max_turns==='5' && cr.context==='full-session','CRLF front matter parses');
ok(cr.rules==='RULE' && cr.stop==='STOP','CRLF sections parse');
const bo = F.parse('x', BOMc + LFfile);
ok(bo.name==='n' && bo.rules==='RULE','a leading BOM is tolerated');
const bc = F.parse('x', BOMc + CRLFfile);
ok(bc.name==='n' && bc.rules==='RULE','BOM and CRLF together');
ok(F.parse('x', LFfile.replace('max_turns: 5','max_turns: 5   ')).max_turns==='5','a trailing space on a value is trimmed');
ok(F.parse('x', LFfile.replace('description: d','description: a: b: c')).description==='a: b: c','a colon inside a value survives');


// 8. '## once' - the trigger lives in the responder file, not in panel code.
// A perf-specific pattern sitting in af/claims.js is what this replaced.
{
  const p1=F.parse('x',['## once','when: [0-9]+s','ask: how long?','','when: %','ask: by what factor?'].join(NL));
  ok(p1.once.length===2,'once: two entries, got '+p1.once.length);
  ok(p1.once[0].when==='[0-9]+s','once: when kept verbatim');
  ok(p1.once[1].ask==='by what factor?','once: second ask');

  const p2=F.parse('x',['## once','when: a','ask: first line','  second line'].join(NL));
  ok(p2.once[0].ask==='first line second line','once: wrapped ask keeps its tail, got '+JSON.stringify(p2.once[0].ask));

  const p3=F.parse('x',['## once','when: a','','ask: orphan','','when: b','ask: good'].join(NL));
  ok(p3.once.length===1&&p3.once[0].ask==='good','once: half an entry is dropped, got '+JSON.stringify(p3.once));

  ok(F.parse('x','## rules'+NL+'do a thing').once.length===0,'once: absent section is [] not undefined');

  const p4=F.parse('x',['## once','when: [0-9]+ ?%','ask: by what factor?','','## rules','be brief','','## stop','done'].join(NL));
  const back=F.parse('x',F.serialize(p4));
  ok(JSON.stringify(back.once)===JSON.stringify(p4.once),'once: survives a save/load round trip');
  ok(back.rules==='be brief'&&back.stop==='done','once: round trip leaves rules and stop alone');

  const ps=F.parse('perf-skeptic',globalThis.__ccAfSamples.find(s=>s.id==='perf-skeptic').text);
  ok(ps.once.length===3,'once: shipped perf responder carries the whole chain, got '+ps.once.length);
  // what is this a number of -> show me what produced it -> by what factor.
  // Each waits for the one before, and nothing names itself: an entry whose
  // 'after' is its own name can never fire, which is a deadlock that reads as
  // a question that simply never comes up.
  ok(ps.once.map(e=>e.name).join('>')==='frame>code>factor','once: the chain is frame, code, factor');
  ok(ps.once.every(e=>e.after!==e.name),'once: no entry waits for itself');
  ok(new RegExp(ps.once[0].when,'i').test('prefill is 21.8 s'),'once: frame question triggers on a duration');
  // asserting only the English form is how the frame question came to be dead on
  // every one of twelve real turning points while the suite stayed green
  ok(new RegExp(ps.once[0].when,'i').test('הפרומפט לוקח 21.8 שניות'),'once: frame question triggers on a duration written in Hebrew');
  ok(new RegExp(ps.once[0].when,'i').test('זה 500 מילישניות'),'once: and on milliseconds written in Hebrew');
  ok(!new RegExp(ps.once[0].when,'i').test('18 shared layers'),'once: a bare count is not a duration');
  ok(new RegExp(ps.once[1].when,'i').test('that is 12% faster'),'once: factor question triggers on a percent');
  // or it takes the turn the frame question exists for
  ok(new RegExp(ps.once[1].when,'i').test('prefill is 21.8 s'),'once: any figure at all reaches the request for the code');
  ok(new RegExp(ps.once[2].when,'i').test('that is 12% faster'),'once: the factor question still triggers on a percent');
  // '31 percent' spelled out in Hebrew is the same claim as '31%', and the
  // English-only form of this pattern is what left the framing question dead on
  // twelve real turning points
  ok(new RegExp(ps.once[2].when,'i').test('משפר ב-31 אחוז'),'once: the factor question triggers on a percent written in Hebrew');
  ok(!new RegExp(ps.once[2].when,'i').test('18 שכבות'),'once: a bare count in Hebrew is not a percent');
  ok(!(ps.first_question||'').trim(),'once: the shipped responder no longer relies on first_question');
}

// A responder edited in one window has to reach the loop running in another.
// The panel enforces autosend, the context mode, max_turns and the once gate
// from the list it was last sent, and it only asks for a new one when it has
// none - so a save that answered only the window it came from left every other
// window running on whatever it happened to load, with nothing on screen to say
// so. Measured before the fix: one list to the saving panel, zero to the other.
{
  const H = globalThis.__ccAf;
  const got = { a: [], b: [] };
  const A = { postMessage: (m) => got.a.push(m) };
  const B = { postMessage: (m) => got.b.push(m) };
  H.handle({ type: '__ccaf', op: 'list' }, A);
  H.handle({ type: '__ccaf', op: 'list' }, B);
  got.a.length = 0; got.b.length = 0;
  const r = S.read('perf-skeptic');
  H.handle({ type: '__ccaf', op: 'save',
             responder: Object.assign({}, r, { model: 'opus', max_turns: '50' }) }, A);
  const listOf = (x) => got[x].filter((m) => m.op === 'list').pop();
  const modelOf = (x) => { const l = listOf(x); return l && (l.items.find((i) => i.id === 'perf-skeptic')||{}).model; };
  ok(!!listOf('a') && modelOf('a') === 'opus', 'save: the window that saved gets the new list');
  ok(!!listOf('b'), 'save: so does every other window that has spoken to this host');
  ok(modelOf('b') === 'opus', 'save: and it carries the edit, got ' + modelOf('b'));

  got.a.length = 0; got.b.length = 0;
  H.handle({ type: '__ccaf', op: 'delete', id: 'plan-drift' }, B);
  ok(got.a.some((m) => m.op === 'list'), 'delete: the other window is told too');

  // A disposed webview throws on postMessage and there is no dispose event on
  // this side, so throwing is how it is dropped. It must not take the
  // broadcast down with it.
  const dead = { postMessage: () => { throw new Error('disposed'); } };
  H.handle({ type: '__ccaf', op: 'list' }, dead);
  got.a.length = 0;
  H.handle({ type: '__ccaf', op: 'save', responder: S.read('perf-skeptic') }, B);
  ok(got.a.some((m) => m.op === 'list'), 'save: a disposed panel does not stop the others being told');
}

console.log(`\n  ${pass} passed, ${fail} failed`);
fs.rmSync(dir,{recursive:true,force:true});
process.exit(fail?1:0);
