(() => {
  /* Every character the dialog puts on screen, checked for Hebrew. Placeholders
     and aria-labels are on screen too, and are the easy ones to miss. */
  const HEB = /[\u0590-\u05FF]/;
  const dlg = document.querySelector('.__afDlg');
  if (!dlg) return { error: 'dialog not open' };
  const hits = [];
  const seen = new Set();
  for (const el of [dlg, ...dlg.querySelectorAll('*')]) {
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join('');
    for (const [what, v] of [['text', own], ['value', el.value || ''],
                             ['placeholder', el.placeholder || ''],
                             ['aria-label', el.getAttribute ? (el.getAttribute('aria-label') || '') : ''],
                             ['title', el.title || '']]) {
      if (v && HEB.test(v)) {
        const key = what + '|' + v.slice(0, 40);
        if (!seen.has(key)) { seen.add(key); hits.push({ where: String(el.className || el.tagName).slice(0, 24), what, sample: v.replace(/\s+/g, ' ').slice(0, 60) }); }
      }
    }
  }
  return { dialogOpen: true, hebrewFound: hits.length, hits: hits.slice(0, 12) };
})()
