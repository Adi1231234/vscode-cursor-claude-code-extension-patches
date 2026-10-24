// Live test of the desktop renderer payload in Adi's own Chrome (CDP port 9225).
//
//   node run.mjs <claude.ai/code url> <renderer.js> <checks.js> [<checks.js> ...]
//
// Opens the page in a new tab, runs the payload in an isolated world (as the
// app's preload does), then each check script there in turn, printing what it
// returns, and closes the tab. A check that returns "SHOT:<file.png>" gets a
// screenshot of the page saved there.
//
// Nothing a check does can reach Claude: every write request this tab makes to
// claude.ai is answered here with an empty 200 and printed ("SENT ..."), so a
// send is observed - its body included - without leaving the machine. The tab
// is closed at the end, so no retry of it survives either. The [ccd] console
// lines and page errors are printed too.
import { readFileSync, writeFileSync } from "node:fs";
const PORT = 9225;
const [URL_, payloadPath, ...checkPaths] = process.argv.slice(2);
const payload = readFileSync(payloadPath, "utf8");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const QUIET = /event_logging|\/rum\?|statsig|sentry|datadog/;

const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let n = 0; const pend = new Map();
const send = (method, params = {}) => new Promise(r => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });

function onPaused(p) {
    const r = p.request;
    if (r.method === "GET" || r.method === "OPTIONS" || r.method === "HEAD") return send("Fetch.continueRequest", { requestId: p.requestId });
    if (!QUIET.test(r.url)) console.log("SENT", r.method, r.url.slice(0, 120), (r.postData || "").slice(0, 300));
    return send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: "content-type", value: "application/json" }], body: Buffer.from("{}").toString("base64") });
}

ws.addEventListener("message", ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === "Fetch.requestPaused") onPaused(m.params);
    if (m.method === "Runtime.consoleAPICalled") {
        const line = m.params.args.map(a => a.value ?? a.description ?? "").join(" ");
        if (/\[ccd\]|\[q\]|queue/i.test(line)) console.log("CONSOLE", line.slice(0, 300));
    }
    if (m.method === "Runtime.exceptionThrown") console.log("PAGE-ERROR", JSON.stringify(m.params.exceptionDetails).slice(0, 300));
});

const val = async (expression, contextId) => {
    const m = await send("Runtime.evaluate", { expression, contextId, returnByValue: true, awaitPromise: true });
    if (m.result?.exceptionDetails) return "EXC: " + JSON.stringify(m.result.exceptionDetails).slice(0, 600);
    return m.result?.result?.value;
};

try {
    await send("Fetch.enable", { patterns: [{ urlPattern: "https://claude.ai/*", requestStage: "Request" }] });
    await send("Page.enable"); await send("Runtime.enable");
    await send("Page.navigate", { url: URL_ });
    let ready = false;   // the app renders after load; bounded wait for its composer
    for (let i = 0; i < 60 && !ready; i++) { ready = await val('!!document.querySelector("[data-testid=code-prompt-input]")'); if (!ready) await sleep(500); }
    if (!ready) throw new Error("composer never appeared");
    await sleep(1500);
    const tree = await send("Page.getFrameTree");
    const w = await send("Page.createIsolatedWorld", { frameId: tree.result.frameTree.frame.id, worldName: "ccd-test" });
    const ctx = w.result.executionContextId;
    console.log("inject:", await val(payload + "\n;'ok'", ctx));
    await sleep(1500);
    for (const p of checkPaths) {
        const r = await val(readFileSync(p, "utf8"), ctx);
        console.log(r);
        const shot = typeof r === "string" && r.match(/^SHOT:(\S+)/);
        if (shot) {   // the check left something on screen to look at
            const png = await send("Page.captureScreenshot", { format: "png" });
            writeFileSync(shot[1], Buffer.from(png.result.data, "base64"));
        }
    }
} finally {
    await send("Fetch.disable").catch(() => {});
    await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`).catch(() => {});
    ws.close();
}
