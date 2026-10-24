// The facts the queue acts on at a run's end, fed through the app's event
// stream (fake-ipc.prelude.js) on a conversation the page is moved to:
//   a stop from elsewhere parks the queue; a run refused by a usage limit
//   holds it with a "continue" first; a run that finished sends the next item.
// Busy is the Stop button, so a stand-in one is put in and taken out.
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const SID = "local_00000000-0000-4000-8000-00000000c0de";
    const R = window.__qRemote, out = { ipcWired: window.__ccdIpc.ready, channels: window.__fakeIpc.channels.map(c => c.name.slice(-25)) };
    const cell = document.querySelector('[data-testid="code-prompt-send-cell"]');
    let stop = null;
    const nudge = () => { const n = document.createElement("i"); document.body.appendChild(n); n.remove(); };
    const busy = async on => {
        if (on && !stop) { stop = document.createElement("button"); stop.setAttribute("data-testid", "code-prompt-stop"); cell.appendChild(stop); }
        if (!on && stop) { stop.remove(); stop = null; }
        nudge(); await sleep(150);
    };
    const frame = message => window.__fakeIpc.emit("LocalSessions_$_onEvent", { type: "message", sessionId: SID, message });
    const user = (t, uuid) => frame({ type: "user", uuid, message: { role: "user", content: [{ type: "text", text: t }] } });
    const said = (t, uuid, model) => frame({ type: "assistant", uuid, message: { model, content: [{ type: "text", text: t }] } });
    const snap = () => R.run({ op: "list" }).queue;

    try { localStorage.removeItem("ccq:" + SID); } catch (e) {}   // a clean conversation every run
    history.pushState({}, "", "/code/" + SID); nudge(); await sleep(300);
    out.store = window.__ccStore().sessionId;

    R.run({ op: "pause" }); R.run({ op: "add", text: "QTEST next one" }); R.run({ op: "add", text: "QTEST and after" });
    await busy(true); R.run({ op: "play" });
    user("[Request interrupted by user]", "u-stop");
    await busy(false); await sleep(300);
    out.stopElsewhere = { paused: snap().paused, lane: snap().lane.length };

    await busy(true); R.run({ op: "play" });
    frame({ type: "rate_limit_event", rate_limit_info: { status: "rejected", rateLimitType: "five_hour", resetsAt: Math.floor(Date.now() / 1000) + 3600 } });
    said("You've hit your session limit", "a-limit", "<synthetic>");
    frame({ type: "result", is_error: true, api_error_status: 429 });
    await busy(false); await sleep(300);
    let s = snap();
    out.usageLimit = { lane: s.lane.map(i => i.text + (i.at ? "@" + Math.round((i.at - Date.now()) / 60000) + "m" : "")), paused: s.paused,
        badge: (document.querySelector(".__qHead") || {}).textContent };

    R.run({ op: "del", ref: "1" });
    frame({ type: "rate_limit_event", rate_limit_info: { status: "allowed" } });
    await busy(true); R.run({ op: "play" });
    said("All done.", "a-done", "claude-opus-5-5");
    frame({ type: "result", is_error: false });
    await busy(false);
    const timeline = [];
    for (let i = 0; i < 30; i++) { await sleep(100); timeline.push(snap().lane.length + (window.__qAuto.busy() ? "b" : "i")); }
    s = snap();
    out.finished = { lane: s.lane.map(i => i.text), sched: s.scheduled.map(i => i.text), paused: s.paused, timeline: timeline.join(" ") };
    R.run({ op: "pause" });
    try { localStorage.removeItem("ccq:" + SID); } catch (e) {}
    history.pushState({}, "", "/code"); nudge(); await sleep(200);
    return JSON.stringify(out, null, 1);
})()
