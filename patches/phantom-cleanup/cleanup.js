const P=require("path"),F=require("fs/promises"),OS=require("os");
const APPLY=process.argv.includes("--apply");
const CONTENT=new Set(["user","assistant","attachment","system","progress","summary"]);
async function classify(file){
  let txt; try{txt=await F.readFile(file,"utf8")}catch{return null}
  let hasContent=false,size=Buffer.byteLength(txt);
  for(const ln of txt.split("\n")){ if(!ln.trim())continue; let o;
    try{o=JSON.parse(ln)}catch{continue}
    if(CONTENT.has(o.type)){hasContent=true;break}
  }
  return{hasContent,size};
}
(async()=>{
  const root=P.join(OS.homedir(),".claude","projects");
  let rootDirs; try{rootDirs=await F.readdir(root,{withFileTypes:true})}catch{console.log("no projects dir");return}
  const bySid=new Map();
  for(const d of rootDirs){ if(!d.isDirectory())continue;
    let files; try{files=await F.readdir(P.join(root,d.name))}catch{continue}
    for(const f of files){ if(!f.endsWith(".jsonl"))continue;
      const sid=f.slice(0,-6); if(!/^[0-9a-f-]{30,}$/i.test(sid))continue;
      const full=P.join(root,d.name,f); const info=await classify(full); if(!info)continue;
      if(!bySid.has(sid))bySid.set(sid,[]); bySid.get(sid).push({dir:d.name,full,...info});
    }
  }
  let found=0,del=0;
  for(const [sid,arr] of bySid){
    if(arr.length<2)continue;
    const content=arr.filter(x=>x.hasContent), meta=arr.filter(x=>!x.hasContent);
    if(!content.length||!meta.length)continue;
    for(const ph of meta){
      found++;
      console.log((APPLY?"[DELETE] ":"[dry] ")+ph.size+"b :: "+ph.dir+"/"+sid+".jsonl");
      if(APPLY){try{await F.unlink(ph.full);del++}catch(e){console.log("  unlink failed: "+e.message)}}
    }
  }
  console.log(APPLY ? ("Deleted "+del+" phantom file(s).") : ("Would delete "+found+" phantom file(s)."));
})();
