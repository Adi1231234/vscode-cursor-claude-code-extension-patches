#!/usr/bin/env bash
# act.sh '<json action>' <seconds>: hand an action to the sandbox app, wait, print the probe.
id=$(date +%s%N | cut -c1-13)
node -e 'const a=JSON.parse(process.argv[1]);a.id=process.argv[2];require("fs").writeFileSync("C:/b/ccd-sandbox/out/cmd.json",JSON.stringify(a))' "$1" "$id"
sleep "${2:-8}"
node -e '
const p=JSON.parse(require("fs").readFileSync("C:/b/ccd-sandbox/out/probe.json","utf8"));
const q=p.queue||{};
console.log("url:",p.url.replace("https://claude.ai",""),"| current:",p.current,"| busy:",p.busy,"running:",p.running);
console.log("queue:",JSON.stringify({paused:q.paused,lane:(q.lane||[]).map(i=>i.text),sched:(q.scheduled||[]).map(i=>i.text)}));
console.log("last action:",JSON.stringify(p.probe&&p.probe.last));
console.log("getSession:",JSON.stringify(p.extra&&p.extra.getSession));
console.log("session keys:",JSON.stringify(p.seen.sessionKeys));
const t=(p.probe&&p.probe.trail)||[];console.log("trail:");t.slice(-Number(process.argv[1]||25)).forEach(e=>console.log("  ",JSON.stringify(e)));' "${3:-25}"
