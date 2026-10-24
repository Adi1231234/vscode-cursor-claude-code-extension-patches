// The per-row actions menu, opened from the first row.
(async () => {
    document.querySelector(".__qMenuBtn").click();
    await new Promise(r => setTimeout(r, 400));
    return "SHOT:C:/b/ccd-desktop/shots/menu.png";
})()
