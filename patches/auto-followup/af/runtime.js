  /* ---------- Runtime ----------
     The stop hook, the session switch, and the one pass that drives everything.
     A turn is 'over' only after the reply has been quiet for SETTLE_MS: read the
     instant busy drops, it is half a message, and a follow-up to half an answer
     answers something Claude had not finished saying. */
  /* Same funnel every stop path goes through, decorated per session because the
     object is replaced when the conversation changes. No condition on the queue:
     that is precisely the check that would make this fail, because the slot is
     filled after a turn ends and at the moment stop is pressed there is often
     nothing queued at all.

     Stop holds the loop, it does not end it. It used to disarm, which threw away
     the count, the ledgers and the arming for something the person meant as
     "not now" - and getting them back meant Continue, on a state that had just
     cancelled a run. A hold keeps all of it and costs one click to release. */
  function hookStop() {
    try {
      var s = globalThis.__ccStore();
      if (!s || s.__afStopHook || typeof s.interrupt !== "function") return;
      var orig = s.interrupt;
      s.interrupt = function () {
        try { if (armed && !paused) setPaused(true); } catch (e) {}
        return orig.apply(this, arguments);
      };
      s.__afStopHook = 1;
    } catch (e) {}
  }

  function syncSession() {
    var now = sessionId();
    if (now === sid) return;
    var was = sid;
    sid = now;
    var carried = carryOver(was);
    armed = null; meta = null; slot = null; stopped = null; turns = 0; pending = false;
    try {
      /* A reload restores the conversation under a new id, so a session with
         nothing of its own asks whether it is one it has seen before. */
      if (!localStorage.getItem(keyFor(ARM_KEY))) adopt();
      var saved = localStorage.getItem(keyFor(ARM_KEY));
      if (saved) {
        armed = saved;
        meta = findResponder(saved);
        lastSeen = lastAssistant();
        /* The list may not have arrived yet, and until it does maxTurns and the
           approval gate have nothing to read. Ask again rather than run blind. */
        if (!meta) requestList();
      }
      /* After the arming, because the slot it may bring back has to be checked
         against the reply that is on screen now. */
      restoreState(carried);
    } catch (e) {}
    renderAll();
  }

  /* Keep asking until the host answers once. The first request is simply lost
     (measured: twelve seconds after a reload, button on screen, no list; the
     next ask came back in 24 ms), and with no list nothing works, so there is no
     cap on attempts. There is a back-off: 0.5 s doubling to 8 s, reset to 0.5 s
     whenever there is a new store or connection to ask through - which is when
     an answer can first come back. */
  var listRetryMs = 500, nextAskAt = 0;

  function askForList() {
    if (listSeen) return;
    var now = Date.now();
    if (now < nextAskAt) { wakeAt(nextAskAt); return; }
    askedListAt = now;
    requestList();
    nextAskAt = now + listRetryMs;
    listRetryMs = Math.min(listRetryMs * 2, 8000);
    wakeAt(nextAskAt);
  }

  function askAgainSoon() {
    if (listSeen) return;
    nextAskAt = 0;
    listRetryMs = 500;
  }

  function tick() {
    syncSession();
    hookStop();
    askForList();
    ensureButton();
    var busy = qApi() ? qApi().busy() : false;
    if (busy) { wasBusy = true; idleAt = 0; renderLane(); saveState(); return; }
    if (wasBusy) { wasBusy = false; idleAt = Date.now(); }
    if (idleAt && Date.now() - idleAt < SETTLE_MS) { wakeAt(idleAt + SETTLE_MS); return; }
    maybeRun();
    maybeSend();
    renderLane();
    saveState();
  }

  /* ---------- What runs the pass ----------
     Nothing on a timer. It used to be a setInterval of 300 ms in every panel,
     armed or not, and each pass rewrote the button's tooltip - the clock that
     woke every other observer in the panel, 47% of the renderer thread all the
     panels share (measured 2026-09-24). Now a pass runs when something it reads
     can have changed: busy (a push), the conversation or the connection (a
     push), the composer being re-rendered (the shared observer), the queue
     changing (its own push), and any state change of ours (renderAll). The one
     timer left is a one-shot wake-up for the end of a settle or a list retry. */
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
    if (W) W.on(schedulePass, { scope: composerArea });
    if (q && typeof q.subscribe === "function") q.subscribe(schedulePass);
    schedulePass();
  }

  wire();
})();</script>
