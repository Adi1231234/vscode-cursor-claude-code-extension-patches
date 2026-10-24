// /queue from the phone, as main/router.js hands it to the page: a command for
// the CLI session behind the conversation on screen runs in its queue; one for
// any other session is left for another page; "drop" is refused.
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const SID = "local_00000000-0000-4000-8000-0000000fa11e", CLI = "c1i5e55-0000-4000-8000-000000000001";
    const out = { hello: window.__fakeIpc.sent.some(s => s.channel === "ccd-phone-hello") };
    try { localStorage.removeItem("ccq:" + SID); } catch (e) {}
    history.pushState({}, "", "/code/" + SID);
    const n = document.createElement("i"); document.body.appendChild(n); n.remove();
    await sleep(300);
    window.__fakeIpc.emit("LocalSessions_$_onEvent", { type: "transcript_loaded", sessionId: SID, messages: [{ sessionId: CLI, type: "user" }] });
    const ask = async (id, sid, cmd) => {
        window.__fakeIpc.emit("ccd-phone", { id, sid, cmd });
        await sleep(50);
        return window.__fakeIpc.sent.filter(s => s.channel === "ccd-phone-answer" && s.msg.id === id).map(s => s.msg)[0];
    };
    out.mapped = window.__ccdSessions.localOf(CLI) === SID;
    let a = await ask(1, CLI, { op: "pause" });
    out.pause = a && a.result && { error: a.result.error, paused: a.result.queue.paused };
    a = await ask(2, CLI, { op: "add", text: "QTEST from the phone" });
    out.add = a && a.result && { error: a.result.error, lane: a.result.queue.lane.map(i => i.text) };
    out.panelShowsIt = [...document.querySelectorAll(".__qRow .__qText")].some(t => /from the phone/.test(t.textContent));
    a = await ask(3, "some-other-cli-session", { op: "list" });
    out.other = a && { hasResult: "result" in a };
    a = await ask(4, CLI, { op: "drop", question: "x" });
    out.drop = a && a.result && a.result.error;
    a = await ask(5, CLI, { op: "del", ref: "1" });
    out.del = a && a.result && a.result.queue.lane.length;
    try { localStorage.removeItem("ccq:" + SID); } catch (e) {}
    history.pushState({}, "", "/code");
    return JSON.stringify(out, null, 1);
})()
