# Worktree session TITLE written to the wrong project dir (opens empty).
# renameSession() writes the title to the MAIN repo's project dir, but the
# transcript lives under the WORKTREE dir - creating a title-only "phantom" that
# the open-content resolver (bRt) returns instead of the real transcript. Fix:
# resolve <sid>.jsonl to whichever project dir actually holds it (largest file =
# the real transcript). Injects the shared __ccWtResolve helper (reused by the
# fork/diff patch). Fail-safe: no anchor -> no-op. Pairs with phantom-cleanup.
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js -match '/\* WTTITLEFIX \*/') { Write-Skip 'already patched'; return }

    $rx = 'async renameSession\((\w+),(\w+),(\w+)\)\{let (\w+)=(\w+)\(this\.projectRoot\),(\w+)=(\w+)\.join\(\4,`\$\{\1\}\.jsonl`\);'
    if ($js -match $rx) {
        $helper = 'globalThis.__ccWtResolve=async function(sid,fallback){try{const P=require("path"),F=require("fs/promises"),OS=require("os");const root=P.join(OS.homedir(),".claude","projects");let dirs;try{dirs=await F.readdir(root,{withFileTypes:true})}catch{return fallback}let best=fallback,bestSize=-1;for(const d of dirs){if(!d.isDirectory())continue;const f=P.join(root,d.name,sid+".jsonl");try{const st=await F.stat(f);if(st.isFile()&&st.size>bestSize){bestSize=st.size;best=f}}catch{}}return best}catch{return fallback}};'
        $js = [regex]::Replace($js, $rx, '$&${6}=await globalThis.__ccWtResolve(${1},${6});')
        Write-Text $Ctx.Js ("/* WTTITLEFIX */`n$helper`n" + $js)
        Write-Ok 'title write resolved to the real transcript dir'
    } else {
        Write-Miss 'renameSession anchor not found'
    }
}
