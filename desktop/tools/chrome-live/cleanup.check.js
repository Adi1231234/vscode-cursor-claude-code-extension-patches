// Leaves the page as the test found it: the queue emptied, its saved state
// removed, the composer empty.
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const s = window.__ccStore && window.__ccStore();
    const sid = s && s.sessionId;
    if (window.__ccdQueues.shown().api.__qRemote) {
        let snap = window.__ccdQueues.shown().api.__qRemote.run({ op: "pause" }).queue;
        for (let guard = 0; guard < 50 && snap.lane.length + snap.scheduled.length; guard++) {
            snap = window.__ccdQueues.shown().api.__qRemote.run({ op: "del", ref: "1" }).queue;
            if (!snap.lane.length && snap.scheduled.length) snap = window.__ccdQueues.shown().api.__qRemote.run({ op: "del", ref: "id:" + snap.scheduled[0].id }).queue;
        }
    }
    await sleep(300);
    try { if (sid) localStorage.removeItem("ccq:" + sid); } catch (e) {}
    const inp = document.querySelector('[data-testid="code-prompt-input"]');
    inp.focus(); document.execCommand("selectAll", false); document.execCommand("delete", false);
    await sleep(200);
    return JSON.stringify({ cleaned: true, left: window.__ccdQueues.shown().api.__qAuto && window.__ccdQueues.shown().api.__qAuto.count(), composer: inp.innerText.trim(),
        stored: (() => { try { return localStorage.getItem("ccq:" + sid); } catch (e) { return "?"; } })() });
})()
