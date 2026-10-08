/* Starts a fresh conversation in the panel, so a run never continues an older one. */
(async () => {
  const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'New session');
  if (!b) return 'no new-session button';
  b.click();
  await new Promise((r) => setTimeout(r, 2500));
  return 'new session';
})()
