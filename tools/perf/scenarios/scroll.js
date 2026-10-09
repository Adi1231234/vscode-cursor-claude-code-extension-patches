/* Scroll the transcript up 40 steps and back, one step a frame - the way a
   wheel moves it. One expression, evaluated in the page. */
(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const el = [...document.querySelectorAll('div')].find((e) =>
    e.scrollHeight > e.clientHeight + 400 && /auto|scroll/.test(getComputedStyle(e).overflowY));
  if (!el) return { ok: false };
  const bottom = el.scrollTop;
  for (let i = 0; i < 40; i++) { el.scrollTop -= 300; await frame(); }
  for (let i = 0; i < 40; i++) { el.scrollTop += 300; await frame(); }
  el.scrollTop = bottom;
  await frame();
  return { ok: true, height: el.scrollHeight };
})()
