/* Installed in a claude.ai session page by phone.mjs: drives the question card
 * the site draws for a Remote Control session the way a person does on the
 * phone - tap an option, type into Other, Skip, or the X - and sends messages
 * from its composer. Read off the live DOM (2026-10-04): the card is
 * .epitaxy-approval-card; the question is its whitespace-pre-wrap span; an
 * option is a button whose label sits in .text-body and is sent on tap; Other
 * opens a textarea sent with Submit; X is "Dismiss question". The site's own
 * answers for Skip and X are "[No preference]" and "[User dismissed - ...]".
 *
 * Waiting is a MutationObserver, not a poll: each wait resolves on the change
 * it waits for, or gives up after its own deadline. */
(() => {
  const R = (window.__rc = {});
  const btns = (c) => [...c.querySelectorAll('button')];
  const optionOf = (b) => b.querySelector('.text-body');
  const sig = (c) => R.read(c) && JSON.stringify(R.read(c));

  R.until = (pred, ms) => new Promise((resolve) => {
    const first = pred();
    if (first) { resolve(first); return; }
    let timer = null;
    const mo = new MutationObserver(() => { const v = pred(); if (v) { mo.disconnect(); clearTimeout(timer); resolve(v); } });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    timer = setTimeout(() => { mo.disconnect(); resolve(null); }, ms);
  });

  /* Popups of the site itself ("Sign in again", "Enable notifications"): Not now. */
  R.dismissPopups = () => {
    for (const d of document.querySelectorAll('[role=dialog],[role=alertdialog]')) {
      const b = [...d.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Not now');
      if (b) b.click();
    }
  };

  R.card = () => { const all = document.querySelectorAll('.epitaxy-approval-card'); return all.length ? all[all.length - 1] : null; };
  R.read = (c) => {
    const q = c && c.isConnected && c.querySelector('.whitespace-pre-wrap');
    if (!q) return null;
    return { question: q.innerText.trim(), labels: btns(c).map(optionOf).filter(Boolean).map((x) => x.textContent.trim()) };
  };

  /* The next card not answered yet: {question, labels}, or null. */
  R.next = (ms = 20000) => R.until(() => {
    const c = R.card();
    const v = c && R.read(c);
    return v && v.labels.length && c.__answered !== sig(c) ? v : null;
  }, ms);

  const done = (c) => { c.__answered = sig(c); };

  /* A number taps that option, a label taps it, anything else goes into Other. */
  R.answer = async (a) => {
    const c = R.card();
    if (!c) return 'no card';
    const options = btns(c).filter(optionOf);
    const b = typeof a === 'number' ? options[a] : options.find((x) => optionOf(x).textContent.trim() === a);
    done(c);
    if (b) { b.click(); return 'tapped'; }
    btns(c).find((x) => x.innerText.split('\n')[0].trim() === 'Other').click();
    const ta = await R.until(() => c.querySelector('textarea'), 3000);
    ta.focus();
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, String(a));
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const submit = await R.until(() => btns(c).find((x) => /^Submit/.test(x.innerText.trim()) && !x.disabled), 4000);
    if (!submit) return 'submit never enabled';
    submit.click();
    return 'typed';
  };

  R.x = () => {
    const c = R.card(), b = c && c.querySelector('button[aria-label="Dismiss question"]');
    if (!b) return 'no x';
    done(c);
    b.click();
    return 'closed';
  };

  /* The site's Stop button, which shows while a turn runs. */
  R.stop = async () => {
    const b = await R.until(() => [...document.querySelectorAll('button')].find((x) =>
      (x.getAttribute('aria-label') || x.innerText || '').trim() === 'Stop'), 5000);
    if (!b) return 'no stop button';
    b.click();
    return 'stopped';
  };

  /* Type into the composer and press its Send button. */
  R.send = async (text) => {
    R.dismissPopups();
    const el = await R.until(() => document.querySelector('[contenteditable="true"][aria-label="Prompt"]'), 15000);
    if (!el) return 'no composer';
    el.focus();
    document.execCommand('insertText', false, text);
    const send = await R.until(() => [...document.querySelectorAll('button')].find((x) =>
      (x.getAttribute('aria-label') === 'Send' || x.innerText.trim() === 'Send') && !x.disabled), 4000);
    if (!send) return 'no send button';
    send.click();
    return 'sent';
  };

  R.dismissPopups();
  return 'installed';
})()
