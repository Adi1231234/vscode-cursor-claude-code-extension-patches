(() => {
  const de = document.documentElement;
  /* Two boxes overlap only if their rectangles intersect. Comparing consecutive
     boxes by top and height alone called the side-by-side pair an overlap, which
     is the instrument being wrong rather than the layout. */
  const rects = [...document.querySelectorAll('.__afBox')].map((e) => {
    const r = e.getBoundingClientRect();
    const head = e.querySelector('.__afBoxHead');
    return { t: r.top, b: r.bottom, l: r.left, r: r.right,
             h: Math.round(r.height), w: Math.round(r.width),
             name: head ? head.textContent.replace(/\s+/g, ' ').slice(0, 14) : '?' };
  });
  const hits = [];
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) hits.push(a.name + ' x ' + b.name);
    }
  const zero = rects.filter((r) => r.h < 30).map((r) => r.name);
  return { viewport: de.clientWidth, boxes: rects.map((r) => r.name + ' ' + r.w + 'x' + r.h),
           overlapping: hits, collapsed: zero };
})()
