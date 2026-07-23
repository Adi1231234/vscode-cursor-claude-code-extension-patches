# Worktree session FORK / inline-diff "Session not found".
# forkSession() and the inline diff view call ensureSessionLoaded(sid), which
# reads ONLY the main project dir -> a worktree session loads nothing -> throws.
# Fork also re-reads the original a second time for its file-history (checkpoint)
# data via the same wrong path. Fix: resolve the session file across worktree dirs
# in both places (reuses the __ccWtResolve helper from worktree-title-dir;
# re-injects it if absent so this patch is self-sufficient). Fail-safe: no anchor -> no-op.
function Invoke-Patch {
    param($Ctx)
    $js = Read-Text $Ctx.Js
    if ($js -match '/\* WTFORKFIX \*/') { Write-Skip 'already patched'; return }

    $esRx = '(async ensureSessionLoaded\((\w)\)\{if\(this\.loadedSessions\.has\(\2\)\)return;let \w=\w+\(this\.projectRoot\),)(\w)=(\w+\.join\(\w+,`\$\{\2\}\.jsonl`\))'
    if ($js -match $esRx) {
        if ($js -notmatch '__ccWtResolve=async function') {
            $helper = 'globalThis.__ccWtResolve=async function(sid,fallback){try{const P=require("path"),F=require("fs/promises"),OS=require("os");const root=P.join(OS.homedir(),".claude","projects");let dirs;try{dirs=await F.readdir(root,{withFileTypes:true})}catch{return fallback}let best=fallback,bestSize=-1;for(const d of dirs){if(!d.isDirectory())continue;const f=P.join(root,d.name,sid+".jsonl");try{const st=await F.stat(f);if(st.isFile()&&st.size>bestSize){bestSize=st.size;best=f}}catch{}}return best}catch{return fallback}};'
            $js = "/* CCWTRESOLVE */`n$helper`n" + $js
        }
        # message load
        $js = [regex]::Replace($js, $esRx, '${1}${3}=await globalThis.__ccWtResolve(${2},${4})')
        # fork's second read for file-history (anchor on fork-unique `,d=new Map,p=[]`)
        $fhRx = '(\w)=((\w+)\.join\(\w+,`\$\{(\w)\}\.jsonl`\)),d=new Map,p=\[\]'
        $js = [regex]::Replace($js, $fhRx, '${1}=await globalThis.__ccWtResolve(${4},${2}),d=new Map,p=[]')
        Write-Text $Ctx.Js ("/* WTFORKFIX */`n" + $js)
        Write-Ok 'fork/diff session load resolved across worktree dirs'
    } else {
        Write-Miss 'ensureSessionLoaded anchor not found'
    }
}
