// Play sends the first queued item through the composer, the way a person
// would. run.mjs answers the request itself and prints it as "SENT", so the
// body can be read off the output while nothing reaches Claude.
(async () => {
    const q = s => document.querySelector(s), sleep = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    if (!window.__qRemote || window.__qAuto.busy()) return JSON.stringify({ skipped: "not booted or busy" });
    const inp = q('[data-testid="code-prompt-input"]');
    inp.focus();
    document.execCommand("insertText", false, "QTEST send A");
    document.execCommand("insertParagraph", false);
    document.execCommand("insertText", false, "second line");
    inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", altKey: true, bubbles: true, cancelable: true }));
    await sleep(300);
    let snap = window.__qRemote.run({ op: "list" }).queue;
    out.queued = { lane: snap.lane.map(i => i.text), paused: snap.paused };
    snap = window.__qRemote.run({ op: "play" }).queue;
    const seen = [];
    for (let i = 0; i < 30; i++) {
        await sleep(100);
        seen.push(inp.innerText.trim().slice(0, 20) + "|" + window.__qAuto.busy());
    }
    snap = window.__qRemote.run({ op: "list" }).queue;
    out.after = { lane: snap.lane.length, composer: inp.innerText.trim(), states: [...new Set(seen)] };
    return JSON.stringify(out, null, 1);
})()
