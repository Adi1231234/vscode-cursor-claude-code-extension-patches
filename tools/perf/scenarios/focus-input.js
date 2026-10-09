/* Focus the composer and clear it, so typed text goes in and nothing else is
   sent with it (the composer is a contenteditable textbox, not a textarea).
   One expression, evaluated in the page. */
(() => {
  const el = document.querySelector('[role="textbox"][contenteditable]');
  if (!el) return 'none';
  el.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
  document.execCommand('delete');
  return document.activeElement === el ? 'ok' : 'not-focused';
})()
