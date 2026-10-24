// Closes whatever dialog is open.
(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 300));
    return "closed";
})()
