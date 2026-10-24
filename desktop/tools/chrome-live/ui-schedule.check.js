// The schedule dialog, from the row menu.
(async () => {
    const item = [...document.querySelectorAll(".__qMenuItem")].find(b => /Schedule/.test(b.textContent));
    item.click();
    await new Promise(r => setTimeout(r, 500));
    return "SHOT:C:/b/ccd-desktop/shots/schedule.png";
})()
