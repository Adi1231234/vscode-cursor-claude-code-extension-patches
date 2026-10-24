// The log viewer (Ctrl+Alt+L) - the queue's decisions, readable in the app.
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await sleep(300);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "l", ctrlKey: true, altKey: true, bubbles: true, cancelable: true }));
    await sleep(500);
    return "SHOT:C:/b/ccd-desktop/shots/log.png";
})()
