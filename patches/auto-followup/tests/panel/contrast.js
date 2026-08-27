(() => {
  const px = (s) => {
    const n = String(s).match(/-?[0-9.]+/g);
    if (!n) return null;
    if (String(s).indexOf("color(") === 0) return n.slice(0, 3).map((v) => Number(v) * 255);
    return n.slice(0, 3).map(Number);
  };
  const alphaOf = (s) => {
    const n = String(s).match(/-?[0-9.]+/g) || [];
    if (String(s).indexOf("rgba") === 0) return Number(n[3]);
    if (String(s).indexOf("color(") === 0 && String(s).indexOf("/") > 0) return Number(n[3]);
    if (String(s) === "transparent") return 0;
    return 1;
  };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const mix = (fg, bg, a) => fg.map((c, i) => c * a + bg[i] * (1 - a));

  /* The nearest ancestor that actually paints something, which is what the text
     is really sitting on - a transparent parent tells you nothing. */
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor;
      const v = px(c);
      if (!v) continue;
      const alpha = alphaOf(c);
      if (alpha > 0.9) return v;
      if (alpha > 0) { const under = bgOf(e.parentElement) || [30, 30, 30]; return mix(v, under, alpha); }
    }
    return null;
  };
  /* opacity is inherited multiplicatively at paint time, so a .4 label inside a
     .78 heading is at .31 - the computed colour never says so. */
  const opacityOf = (el) => {
    let o = 1;
    for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    return o;
  };

  const probe = [
    ['field label (NAME)', '.__afFi label'],
    ['field value', '.__afFi .__afIn'],
    ['setting label (CONTEXT)', '.__afF label'],
    ['setting value', '.__afF b'],
    ['section heading', '.__afBoxHead'],
    ['section hint', '.__afBoxHead span'],
    ['textarea body', '.__afTa'],
    ['list item name', '.__afLItem .__afT b'],
    ['list item description', '.__afLItem .__afT span'],
    ['footer link (muted)', '.__afFoot .__afLink'],
    ['dialog title', '.__afDlgHead h3'],
  ];
  const out = [];
  for (const [name, sel] of probe) {
    const el = document.querySelector(sel);
    if (!el) { out.push({ name, missing: sel }); continue; }
    const cs = getComputedStyle(el);
    const bg = bgOf(el.parentElement) || [30, 30, 30];
    const eff = mix(px(cs.color), bg, opacityOf(el));
    const r = ratio(eff, bg);
    out.push({ name, size: cs.fontSize, weight: cs.fontWeight,
               opacity: Number(opacityOf(el).toFixed(2)),
               contrast: Number(r.toFixed(2)),
               verdict: r >= 4.5 ? 'AA' : (r >= 3 ? 'AA-large-only' : 'FAIL') });
  }
  return out;
})()
