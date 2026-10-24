// Per-session zoom: switch between two conversation ids via pushState and check
// each keeps its own level, re-applied on switch. webFrame zoom is read back.
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const wf = require("electron").webFrame;
    const A = "session_zoomtestAAAA", B = "session_zoomtestBBBB";
    const nudge = () => { const n = document.createElement("i"); document.body.appendChild(n); n.remove(); };
    const go = async id => { history.pushState({}, "", "/code/" + id); nudge(); await sleep(250); };
    const wheel = (dir, n) => { for (let i = 0; i < n; i++) window.dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: dir === "in" ? -120 : 120, bubbles: true, cancelable: true })); };
    try { localStorage.removeItem("ccd.zoom." + A); localStorage.removeItem("ccd.zoom." + B); } catch (e) {}
    const out = {};

    await go(A); out.A_start = wf.getZoomLevel();
    wheel("in", 3); await sleep(100); out.A_after3in = wf.getZoomLevel();

    await go(B); out.B_onSwitch = wf.getZoomLevel();
    wheel("out", 2); await sleep(100); out.B_after2out = wf.getZoomLevel();

    await go(A); out.A_back = wf.getZoomLevel();
    await go(B); out.B_back = wf.getZoomLevel();

    out.stored = { A: localStorage.getItem("ccd.zoom." + A), B: localStorage.getItem("ccd.zoom." + B) };
    try { localStorage.removeItem("ccd.zoom." + A); localStorage.removeItem("ccd.zoom." + B); } catch (e) {}
    history.pushState({}, "", "/code/session_01CoCw94CcD3e6yLVptG85jQ"); nudge();
    wf.setZoomLevel(0);
    return JSON.stringify(out, null, 1);
})()
