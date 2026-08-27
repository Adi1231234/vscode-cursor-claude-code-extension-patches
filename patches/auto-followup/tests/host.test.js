const fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm');
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

console.log(`\n  ${pass} passed, ${fail} failed`);
fs.rmSync(dir,{recursive:true,force:true});
process.exit(fail?1:0);
