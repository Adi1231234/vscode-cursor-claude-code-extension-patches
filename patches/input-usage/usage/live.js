  var windows = null, sig = null, timer = 0, stopWaiting = null;

  function render() {
    if (timer) { clearTimeout(timer); timer = 0; }
    var now = Date.now(), view = usageView(windows, now);
    showLine(view.text);
    /* One shot, for the next reset only: setTimeout clamps anything past
       ~24.8 days, so a far reset is re-armed from the nearer one. */
    if (view.nextAt) timer = setTimeout(render, Math.min(view.nextAt - now + 1000, 2e9));
  }

  function isSignal(v) {
    return !!(v && typeof v === "object" && "value" in v && typeof v.subscribe === "function");
  }

  /* The app's bundle defines the getter as it evaluates, which may be after
     this script ran; until then every DOM change asks again, and the asking
     stops the moment it is answered. */
  function bind() {
    var get = globalThis.__ccUsageWindows;
    var s = typeof get === "function" ? get() : null;
    if (!isSignal(s)) return false;
    sig = s;
    if (stopWaiting) { stopWaiting(); stopWaiting = null; }
    /* The callback runs inside the app's own signal write: render after it. */
    sig.subscribe(function (w) {
      windows = w;
      Promise.resolve().then(render);
    });
    return true;
  }

  /* Only a change to the box's own children can move the line: a remount, or
     React appending after it. Typing inside the input never gets past this. */
  function touchesBox(records) {
    var b = composer();
    if (!b) return false;
    if (!line || line.parentNode !== b) return true;
    for (var i = 0; i < records.length; i++) {
      if (records[i].target === b) return true;
    }
    return false;
  }

  window.__ccWatch.on(function (records) {
    if (windows && touchesBox(records)) render();
  }, { scope: composer });

  if (!bind()) stopWaiting = window.__ccWatch.on(bind);
})()</script>
