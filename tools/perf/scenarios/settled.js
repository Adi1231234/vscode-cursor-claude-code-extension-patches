/* Resolves once the page has stopped changing for __QUIET__ ms and the
   condition __UNTIL__ holds (an expression), or after 30 s with what it has.
   One expression, evaluated in the page. */
(async () => {
  const quietMs = __QUIET__;
  const until = () => { try { return !!(__UNTIL__); } catch (e) { return false; } };
  let last = performance.now();
  const mo = new MutationObserver(() => { last = performance.now(); });
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
  const t0 = performance.now();
  try {
    while (performance.now() - t0 < 30000) {
      await new Promise((r) => setTimeout(r, 100));
      if (until() && performance.now() - last >= quietMs) break;
    }
  } finally { mo.disconnect(); }
  return {
    ok: until(),
    ms: Math.round(last - t0),
    rows: document.querySelectorAll('[data-transcript-message]').length,
    elements: document.getElementsByTagName('*').length,
  };
})()
