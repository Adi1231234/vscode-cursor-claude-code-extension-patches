(async () => {
  const doc = document;
  const focusables = [...doc.querySelectorAll('.__afDlg [tabindex="0"], .__afDlg button, .__afDlg textarea, .__afDlg input')];
  const named = focusables.map((e) => {
    const t = (e.getAttribute('aria-label') || e.textContent || e.placeholder || e.tagName).trim();
    return { tag: e.tagName.toLowerCase(), role: e.getAttribute('role') || '-', label: t.replace(/\s+/g, ' ').slice(0, 34) };
  });

  /* Does Enter actually work? Focus the first setting and press it, then see
     whether the dropdown appeared. A tab stop that does nothing is worse than
     no tab stop: it looks reachable and is not. */
  const setting = doc.querySelector('.__afF');
  let enterOpens = null;
  if (setting) {
    setting.focus();
    setting.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    enterOpens = !!doc.querySelector('.__afDrop');
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
  }

  const item = doc.querySelector('.__afLItem');
  let ring = null;
  if (item) {
    item.focus();
    const cs = getComputedStyle(item);
    ring = { outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, focused: doc.activeElement === item };
  }
  return { tabStops: named.length, controls: named, enterOpensDropdown: enterOpens, focusRingOnListItem: ring };
})()
