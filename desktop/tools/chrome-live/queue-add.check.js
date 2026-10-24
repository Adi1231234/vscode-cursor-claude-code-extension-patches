// The queue boots on the Code tab, Alt+Enter and the add button queue the
// draft (an idle add parks the queue), and the panel and buttons are drawn
// in place with the Code tab's colours. Never presses plain Enter.
(async () => {
    const q = s => document.querySelector(s), sleep = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    const store = window.__ccStore && window.__ccStore();
    out.booted = { ccd: !!window.__ccd, remote: !!window.__ccdQueues.shown().api.__qRemote, auto: !!window.__ccdQueues.shown().api.__qAuto,
        sid: store && store.sessionId, styles: [...document.querySelectorAll("style[id^=ccd-css-]")].map(s => s.id) };
    if (!window.__ccdQueues.shown().api.__qRemote) return JSON.stringify(out, null, 1);
    out.busy = window.__ccdQueues.shown().api.__qAuto.busy();
    if (out.busy) return JSON.stringify(out);          // never test on a running session

    const inp = q('[data-testid="code-prompt-input"]');
    inp.focus();
    document.execCommand("insertText", false, "QTEST one");
    document.execCommand("insertParagraph", false);
    document.execCommand("insertText", false, "line two");
    await sleep(200);
    out.typed = { innerText: JSON.stringify(inp.innerText), paragraphs: inp.querySelectorAll("p").length };
    const ev = new KeyboardEvent("keydown", { key: "Enter", altKey: true, bubbles: true, cancelable: true });
    inp.dispatchEvent(ev);
    await sleep(400);
    let snap = window.__ccdQueues.shown().api.__qRemote.run({ op: "list" }).queue;
    out.altEnter = { prevented: ev.defaultPrevented, lane: snap.lane.map(i => i.text), paused: snap.paused,
        cleared: inp.innerText.trim() === "" };

    inp.focus(); document.execCommand("insertText", false, "QTEST two");
    const add = q(".__qAdd");
    if (add) add.click();
    await sleep(400);
    snap = window.__ccdQueues.shown().api.__qRemote.run({ op: "list" }).queue;
    out.addButton = { present: !!add, lane: snap.lane.length, cleared: inp.innerText.trim() === "" };

    const row = q('[data-testid="code-prompt-trailing-controls"]');
    const cell = q('[data-testid="code-prompt-send-cell"]');
    out.footer = { order: [...row.children].map(c => c.className.match(/__q\w+/)?.[0] || c.getAttribute("data-testid") || c.tagName) ,
        addBeforeSend: !!add && add.nextElementSibling === cell };

    const panel = q(".__qPanel"), comp = inp.closest('[data-cds="ChatComposer"]');
    const cs = panel && getComputedStyle(panel);
    out.panel = { present: !!panel, beforeComposer: !!panel && panel.nextElementSibling === comp,
        display: cs && cs.display, border: cs && cs.borderTopColor, bg: cs && cs.backgroundColor,
        rows: document.querySelectorAll(".__qRow").length,
        head: q(".__qHeadLabel") && q(".__qHeadLabel").textContent };
    const rowText = q(".__qRow .__qText");
    out.rowColor = rowText && getComputedStyle(rowText).color;
    out.persisted = (() => { try { return JSON.parse(localStorage.getItem("ccq:" + out.booted.sid)).items.length; } catch (e) { return String(e); } })();
    return JSON.stringify(out, null, 1);
})()
