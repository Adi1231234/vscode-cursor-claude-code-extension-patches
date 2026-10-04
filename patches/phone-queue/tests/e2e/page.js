/* Installed in the lab panel by run.mjs: drives the question dialog the way a
 * person does - tap an option, or type into "Other" - and reads the queue and
 * the transcript back. Read off the live DOM (2.1.287): options are
 * [role=radio] rows, "Other" opens a contenteditable, and nothing is sent
 * until "Submit answers" is clicked.
 *
 * Waiting is a MutationObserver on the panel, not a poll: every wait resolves
 * on the change it is waiting for, or gives up after its own deadline. */
(() => {
  const E = (window.__e2e = {});

  E.dialog = () => {
    const submit = [...document.querySelectorAll('button')].find((b) => /Submit answers/.test(b.textContent));
    if (!submit) return null;
    const root = submit.closest('[class*="permissionRequestContainer"]');
    if (!root) return null;
    const q = root.querySelector('[class*="questionText"]');
    return { root, submit, question: q ? q.textContent : '', options: [...root.querySelectorAll('[role="radio"]')] };
  };

  E.until = (pred, ms) => new Promise((resolve) => {
    const first = pred();
    if (first) { resolve(first); return; }
    let timer = null;
    const mo = new MutationObserver(() => {
      const v = pred();
      if (v) { mo.disconnect(); clearTimeout(timer); resolve(v); }
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    timer = setTimeout(() => { mo.disconnect(); resolve(null); }, ms);
  });

  /* The next dialog that is not the one just answered. */
  E.next = async (ms = 20000) => {
    const d = await E.until(() => {
      const x = E.dialog();
      return x && !x.root.__e2eAnswered ? x : null;
    }, ms);
    /* "Other" is the dialog's own free-text row, not one of the mod's buttons. */
    const labels = d ? d.options.map((o) => o.textContent.trim()).filter((l) => l !== 'Other') : [];
    return d ? { question: d.question, labels } : null;
  };

  /* A number taps that option; a string taps the option with that label, or is
     typed into Other. */
  E.answer = async (a) => {
    const d = E.dialog();
    if (!d) return 'no dialog';
    const labels = d.options.map((o) => o.textContent.trim());
    const i = typeof a === 'number' ? a : labels.indexOf(a);
    if (i >= 0 && labels[i] !== 'Other') {
      d.options[i].click();
    } else {
      d.options[labels.indexOf('Other')].click();
      const ed = await E.until(() => d.root.querySelector('[contenteditable]'), 3000);
      ed.focus();
      document.execCommand('insertText', false, String(a));
    }
    await E.until(() => !d.submit.disabled, 3000);
    d.root.__e2eAnswered = true;
    d.submit.click();
    return 'ok';
  };

  /* Command outputs of /queue, oldest first: the rows that start "queue:". */
  E.outputs = () => [...document.querySelectorAll('p')]
    .filter((p) => p.textContent.startsWith('queue:'))
    .map((p) => (p.parentElement ? p.parentElement.innerText : p.textContent));

  E.outputAfter = (n, ms = 20000) => E.until(() => {
    const all = E.outputs();
    return all.length > n ? all[all.length - 1] : null;
  }, ms);

  /* A dialog left open by an earlier run would be answered in place of the
     case's own: close it and wait until it is gone. */
  E.closeAll = async () => {
    for (let d = E.dialog(); d; d = E.dialog()) {
      const root = d.root;
      root.querySelector('[aria-label="Close"]').click();
      await E.until(() => !root.isConnected || !E.dialog() || E.dialog().root !== root ? true : null, 5000);
    }
    return 'closed';
  };

  E.queue = () => window.__qRemote.run({ op: 'list' }).queue;
  E.busy = () => !!(window.__qAuto && window.__qAuto.busy());
  /* Idle, and still idle 2 s later. A message sent by a command (Send now,
     Play) starts its own turn a moment after the command's run has ended; a
     case begun in that gap met a turn it had not sent - its stop then hit an
     empty queue (measured over Remote Control, 2026-10-04). */
  E.idle = async (ms = 120000) => {
    const quiet = () => !E.busy() && !E.dialog();
    for (const end = Date.now() + ms; Date.now() < end;) {
      if (!(await E.until(() => (quiet() ? true : null), end - Date.now()))) return null;
      if (!(await E.until(() => (quiet() ? null : true), 2000))) return true;
    }
    return null;
  };

  /* An empty, paused queue, then the given items added through the same
     surface the phone uses. */
  E.reset = (items) => {
    const r = window.__qRemote;
    let q = r.run({ op: 'list' }).queue;
    while (q.scheduled.length) q = r.run({ op: 'del', ref: 's1' }).queue;
    while (q.lane.length) q = r.run({ op: 'del', ref: '1' }).queue;
    r.run({ op: 'pause' });
    for (const it of items || []) {
      const res = r.run(Object.assign({ op: 'add', mode: 'queue' }, it));
      if (it.off) r.run({ op: 'skip', ref: String(res.queue.lane.length) });
    }
    return r.run({ op: 'list' }).queue;
  };
  return 'installed';
})()
