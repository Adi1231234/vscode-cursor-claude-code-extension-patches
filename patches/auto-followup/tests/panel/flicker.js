(async () => {
  const btn0 = document.querySelector('button.__afBtn');
  if (!btn0) return { error: 'no button' };
  const form = btn0.closest('form');

  const ev = { addedAf: 0, removedAf: 0, childListOnParent: 0, attrOnBtn: 0, innerHtmlWrites: 0 };
  const rects = [];
  let identityChanges = 0;
  let current = btn0;

  const obs = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') {
        if (m.target === current.parentNode) ev.childListOnParent++;
        for (const n of m.addedNodes) if (n.classList && n.classList.contains('__afBtn')) ev.addedAf++;
        for (const n of m.removedNodes) if (n.classList && n.classList.contains('__afBtn')) ev.removedAf++;
        if (m.target === current) ev.innerHtmlWrites++;
      } else if (m.type === 'attributes' && m.target === current) ev.attrOnBtn++;
    }
  });
  obs.observe(form, { childList: true, subtree: true, attributes: true,
                      attributeFilter: ['class', 'style'] });

  const t0 = performance.now();
  for (let i = 0; i < 60; i++) {
    const b = document.querySelector('button.__afBtn');
    if (b !== current) { identityChanges++; current = b; }
    if (b) {
      const r = b.getBoundingClientRect();
      rects.push([Math.round(performance.now() - t0), Math.round(r.left), Math.round(r.top),
                  Math.round(r.width), Math.round(r.height), b.textContent.trim()]);
    } else {
      rects.push([Math.round(performance.now() - t0), null, null, null, null, '(gone)']);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  obs.disconnect();

  const seen = {};
  for (const r of rects) {
    const k = r[1] + ',' + r[3] + ',' + r[5];
    seen[k] = (seen[k] || 0) + 1;
  }
  const missing = rects.filter((r) => r[1] === null).length;
  const lefts = [...new Set(rects.map((r) => r[1]).filter((x) => x !== null))];
  const widths = [...new Set(rects.map((r) => r[3]).filter((x) => x !== null))];
  return {
    samples: rects.length, overMs: rects[rects.length - 1][0],
    mutations: ev,
    nodeIdentityChanges: identityChanges,
    framesWithNoButton: missing,
    distinctLefts: lefts, distinctWidths: widths,
    distinctStates: Object.keys(seen).length,
    stateCounts: seen,
    firstTen: rects.slice(0, 10)
  };
})()
