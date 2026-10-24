// The saved-queues dialog, from its footer button.
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await sleep(300);
    document.querySelector(".__qSaved").click();
    await sleep(500);
    return "SHOT:C:/b/ccd-desktop/shots/saved.png";
})()
