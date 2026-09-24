  /* ---------- What runs the pass ----------
     Nothing on a timer. It used to be a setInterval of 300 ms in every panel,
     armed or not, and each pass rewrote the button's tooltip - the clock that
     woke every other observer in the panel, 47% of the renderer thread all the
     panels share (measured 2026-09-24). Now a pass runs when something it reads
     can have changed: busy (a push), the conversation or the connection (a
     push), the composer being re-rendered (the shared observer), the queue
     changing (its own push), the transcript changing while the loop waits for
     a reply, and any state change of ours (renderAll). The one timer left is a
     one-shot wake-up for the end of a settle, a list retry or a send retry. */
  var inPass = false, passQueued = false, wakeT = 0, wakeTime = 0;

  function pass() {
    passQueued = false;
    if (inPass) return;
    inPass = true;
    try { tick(); } catch (e) {}
    inPass = false;
  }

  function schedulePass() {
    if (passQueued) return;
    passQueued = true;
    setTimeout(pass, 0);
  }

  function wakeAt(t) {
    if (wakeT && wakeTime <= t) return;
    if (wakeT) clearTimeout(wakeT);
    wakeTime = t;
    wakeT = setTimeout(function () { wakeT = 0; wakeTime = 0; pass(); }, Math.max(0, t - Date.now()));
  }

  function composerArea() {
    var e = qInp(), form = e && e.closest("form");
    return form ? form.parentElement : null;
  }

  /* The reply being answered is read from the transcript (lastAssistant),
     which is outside the composer scope. The settle pass is normally when it
     is read, and it is complete by then - but a panel that was hidden while
     the reply finished may not have painted it yet, and the old 300 ms re-read
     covered that. So while the loop is waiting for a reply, and only then, a
     transcript change asks for a pass. While a turn streams, and in every
     other state, it costs a few flag reads per batch of changes. */
  function waitingForReply() {
    if (!armed || paused || stopped || pending || slot) return false;
    var q = qApi();
    return !(q && q.busy());
  }

  /* ---------- Wiring ---------- */
  function wire() {
    var S = window.__ccSession, W = window.__ccWatch, q = qApi();
    if (S) {
      /* Remembered in the callback, not only read in the pass: a turn short
         enough to rise and fall between two passes still has to settle. */
      S.on("busy", function (v) { if (v) wasBusy = true; schedulePass(); });
      S.on("connection", function (v, s, initial) { if (!initial) askAgainSoon(); schedulePass(); });
      S.onStore(function () { askAgainSoon(); schedulePass(); });
    }
    if (W) {
      W.on(schedulePass, { scope: composerArea });
      W.on(function () { if (waitingForReply()) schedulePass(); });
    }
    if (q && typeof q.subscribe === "function") q.subscribe(schedulePass);
    schedulePass();
  }

  wire();
})();</script>
