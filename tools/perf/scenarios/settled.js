/* Resolves once the page has stopped changing for __QUIET__ ms and the
   condition __UNTIL__ holds (an expression), or after 30 s with what it has.
   Pushed, not polled: every change to the page re-arms one timer, and the
   condition is checked when it fires - so the page is not woken ten times a
   second while it is being measured, and the quiet is exactly __QUIET__ ms.
   One expression, evaluated in the page. */
new Promise((resolve) => {
  const quietMs = __QUIET__;
  const until = () => { try { return !!(__UNTIL__); } catch (e) { return false; } };
  const t0 = performance.now();
  let last = t0, quiet = 0;
  const done = () => {
    mo.disconnect();
    clearTimeout(quiet);
    clearTimeout(cap);
    resolve({
      ok: until(),
      ms: Math.round(last - t0),
      rows: document.querySelectorAll('[data-transcript-message]').length,
      elements: document.getElementsByTagName('*').length,
    });
  };
  const arm = () => {
    clearTimeout(quiet);
    quiet = setTimeout(() => { if (until()) done(); }, quietMs);
  };
  const mo = new MutationObserver(() => { last = performance.now(); arm(); });
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
  const cap = setTimeout(done, 30000);
  arm();
})
