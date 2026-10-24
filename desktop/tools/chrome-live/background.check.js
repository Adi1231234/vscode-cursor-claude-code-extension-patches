// A conversation's queue keeps sending while another one is on screen, through
// the app's own sendMessage (here: __fakeIpc.invoked), one item per run; the
// phone steers it there too; and the queue on screen draws only its own.
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const F = window.__fakeIpc, Q = () => window.__ccdQueues;
    const A = "local_0000000a-0000-4000-8000-00000000000a", B = "local_0000000b-0000-4000-8000-00000000000b", CLI_A = "cli-a-0001";
    const nudge = () => { const n = document.createElement("i"); document.body.appendChild(n); n.remove(); };
    const go = async id => { history.pushState({}, "", "/code/" + id); nudge(); await sleep(300); };
    const ev = (type, extra) => F.emit("LocalSessions_$_onEvent", Object.assign({ type, sessionId: A }, extra || {}));
    const sends = () => F.invoked.filter(i => i.channel === "sendMessage").map(i => i.args[0].slice(-3) + ":" + i.args[1]);
    const panelTexts = () => [...document.querySelectorAll(".__qRow .__qText")].map(t => t.textContent);
    [A, B].forEach(id => { try { localStorage.removeItem("ccq:" + id); } catch (e) {} });
    F.answers.getSession = args => ({ isRunning: args[0] === A });
    const out = {};

    await go(A);
    ev("transcript_loaded", { messages: [{ sessionId: CLI_A, type: "user" }] });
    const ra = Q().of(A).api.__qRemote;
    ra.run({ op: "add", text: "QTEST bg one" }); ra.run({ op: "add", text: "QTEST bg two" });
    await sleep(200);
    out.onA = { busy: Q().of(A).api.__qAuto.busy(), panel: panelTexts(), sends: sends() };

    await go(B);
    out.onB = { shown: Q().shown() === Q().of(B), panel: panelTexts(), buttons: document.querySelectorAll(".__qAdd").length };

    ev("session_updated", { session: { isRunning: false } });
    await sleep(400);
    out.afterRunEnds = { sends: sends(), laneA: ra.run({ op: "list" }).queue.lane.map(i => i.text), busyA: Q().of(A).api.__qAuto.busy() };
    await sleep(400);
    out.stillOne = sends().length;

    ev("session_updated", { session: { isRunning: false } });
    await sleep(400);
    out.secondRun = { sends: sends(), laneA: ra.run({ op: "list" }).queue.lane.length };

    F.emit("ccd-phone", { id: 77, sid: CLI_A, cmd: { op: "add", text: "QTEST phone while away" } });
    await sleep(100);
    const ans = F.sent.filter(s => s.channel === "ccd-phone-answer" && s.msg.id === 77)[0];
    out.phoneWhileAway = ans && ans.msg.result && { error: ans.msg.result.error, lane: ans.msg.result.queue.lane.map(i => i.text), paused: ans.msg.result.queue.paused };
    out.panelOnB = panelTexts();

    await go(A);
    out.backOnA = { panel: panelTexts(), buttons: document.querySelectorAll(".__qAdd").length };
    ra.run({ op: "pause" }); ra.run({ op: "del", ref: "1" });
    [A, B].forEach(id => { try { localStorage.removeItem("ccq:" + id); } catch (e) {} });
    history.pushState({}, "", "/code"); nudge(); await sleep(200);
    return JSON.stringify(out, null, 1);
})()
