// A queue with a plain item, a parked one and a scheduled one, paused: the
// panel as it looks on the Code tab.
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const R = window.__ccdQueues.shown().api.__qRemote;
    R.run({ op: "pause" });
    R.run({ op: "add", text: "QTEST first item in the lane" });
    R.run({ op: "add", text: "QTEST a much longer second item that should be cut off with an ellipsis when it runs past the width of the panel" });
    R.run({ op: "add", text: "QTEST scheduled in ten minutes", mode: "timer", dur: 600000 });
    await sleep(500);
    return "SHOT:C:/b/ccd-desktop/shots/panel.png";
})()
