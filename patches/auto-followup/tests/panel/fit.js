/* Does the dialog stay inside the panel - measured in the panel itself.
 *
 *   node tools/lab/lab.mjs eval patches/auto-followup/tests/panel/fit.js
 *   node tools/lab/lab.mjs width 340 && ...eval again
 *
 * browser/fit.html sweeps eight viewports because an iframe can be any size.
 * A panel cannot: it is whatever the editor made it. So this one sweeps the
 * axis that a panel does have - the zoom the zoom patch sets on <body> - and
 * reports the panel's own width alongside, so a run at 340px and a run at full
 * width are two rows of the same table rather than two opinions.
 */
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const de = document.documentElement, b = document.body;
  const was = b.style.zoom;
  const rows = [];

  const open = () => {
    document.querySelectorAll('.__afOverlay,.__afMenu').forEach((n) => n.remove());
    const btn = document.querySelector('button.__afBtn');
    if (!btn) return 'no button - is the patch applied in this panel?';
    btn.click();
    const item = [...document.querySelectorAll('.__afMenu [role="button"],.__afMenu .__afItem')]
      .find((n) => n.textContent.indexOf('Manage') >= 0);
    if (!item) return 'the picker did not open';
    item.click();
    return null;
  };

  for (const z of [1, 1.25, 1.5, 2]) {
    b.style.zoom = z === 1 ? '' : String(z);
    const err = open();
    if (err) { rows.push({ zoom: z, err }); continue; }
    window.dispatchEvent(new Event('resize'));
    await wait(60);

    const dl = document.querySelector('.__afDlg');
    if (!dl) { rows.push({ zoom: z, err: 'no dialog' }); continue; }

    /* Two engines, two coordinate systems, and comparing a rect to clientHeight
       is only valid in one of them. Chrome 141 multiplies a rect by the zoom, so
       a rect is already in screen pixels; the Electron in VS Code 1.135 leaves it
       in the element's own units, so the screen has to be divided by the zoom
       before the comparison means anything. The quotient below says which engine
       this is - it is the zoom in the first and 1 in the second. Without this the
       probe reported the same numbers at every zoom and called a dialog hanging a
       third of its height off the panel a pass. */
    const own = b.offsetHeight, seen = b.getBoundingClientRect().height;
    const ratio = own > 0 ? seen / own : 1;
    const rectsAreScreenSpace = Math.abs(ratio - z) < 0.05;
    const screenH = de.clientHeight / (rectsAreScreenSpace ? 1 : z);
    const screenW = de.clientWidth / (rectsAreScreenSpace ? 1 : z);
    const head = dl.querySelector('.__afDlgHead');
    const foot = dl.lastElementChild;
    const body = dl.querySelector('.__afDlgBody');
    const inView = (n) => { const r = n.getBoundingClientRect();
      return r.top >= -1 && r.bottom <= screenH + 1; };

    /* The header is read before anything is scrolled. Reading it after scrolling
       down to find the footer reports a clipped header that is the probe. */
    dl.scrollTop = 0;
    const headOk = inView(head);
    const reach = (n) => {
      if (inView(n)) return true;
      dl.scrollTop += n.getBoundingClientRect().top - dl.getBoundingClientRect().top;
      return inView(n);
    };
    const buttons = [...foot.querySelectorAll('[role="button"],button')];
    const footOk = buttons.length > 0 && buttons.every(reach);
    dl.scrollTop = 0;

    const x = dl.getBoundingClientRect();
    const off = [Math.max(0, Math.round(-x.top)), Math.max(0, Math.round(x.bottom - screenH)),
                 Math.max(0, Math.round(-x.left)), Math.max(0, Math.round(x.right - screenW))];
    rows.push({ zoom: z, panel: [de.clientWidth, de.clientHeight],
      screenInRectUnits: [Math.round(screenW), Math.round(screenH)], rectsAreScreenSpace,
      dlg: [Math.round(x.width), Math.round(x.height)],
      offTBLR: off, bodyH: Math.round(body.getBoundingClientRect().height),
      headOk, footOk,
      bad: off.some((n) => n > 0) || !headOk || !footOk || body.getBoundingClientRect().height < 40 });
  }

  document.querySelectorAll('.__afOverlay,.__afMenu').forEach((n) => n.remove());
  b.style.zoom = was;
  window.dispatchEvent(new Event('resize'));

  const bad = rows.filter((r) => r.bad || r.err);
  return { panelWidth: de.clientWidth, panelHeight: de.clientHeight,
           failed: bad.length, total: rows.length, rows };
})()
