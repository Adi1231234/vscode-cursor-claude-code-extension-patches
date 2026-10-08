/* Resolves when the panel's run ends (busy goes true, then false), or with
   "permission" as soon as the run stops on a permission prompt - the caller
   answers it and waits again. Both are signals, so this waits on their edges
   instead of polling. A turn that never starts within 20 seconds resolves too,
   so a lost prompt does not hang the test. */
new Promise((resolve) => {
  const s = globalThis.__ccStore && globalThis.__ccStore();
  if (!s || !s.busy || typeof s.busy.subscribe !== 'function') return resolve('no-store');
  let seen = false;
  let done = false;
  const offs = [];
  const finish = (why) => {
    if (done) return;
    done = true;
    offs.forEach((off) => off());
    resolve(why);
  };
  offs.push(s.busy.subscribe((v) => {
    if (v) seen = true;
    else if (seen) finish('idle');
  }));
  if (s.permissionRequests && typeof s.permissionRequests.subscribe === 'function') {
    offs.push(s.permissionRequests.subscribe((list) => {
      if (list && list.length) finish('permission');
    }));
  }
  if (done) offs.forEach((off) => off());
  setTimeout(() => { if (!seen) finish('never-busy'); }, 20000);
  setTimeout(() => finish('timeout'), 600000);
})
