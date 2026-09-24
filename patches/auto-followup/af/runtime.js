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
