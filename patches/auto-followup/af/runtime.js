  /* ---------- Runtime ----------
     The stop hook, the session switch, and the one pass that drives everything.

     A turn is 'over' only after the reply has been quiet for SETTLE_MS. Reading
     it the instant busy drops catches a half-streamed message, and a responder
     given half an answer writes a follow-up to something Claude had not finished
     saying. */
  /* Same funnel every stop path goes through, decorated per session because the
     object is replaced when the conversation changes. No condition on the queue:
     that is precisely the check that would make this fail. */
  function hookStop() {
    try {
      var s = globalThis.__ccStore();
      if (!s || s.__afStopHook || typeof s.interrupt !== "function") return;
      var orig = s.interrupt;
      s.interrupt = function () {
        try { if (armed) disarm("stopped by hand"); } catch (e) {}
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
    carryOver(was);
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
      restoreState();
    } catch (e) {}
    renderAll();
  }

  function tick() {
    syncSession();
    hookStop();
    /* Keep asking until the host answers once.

       The request at the bottom of this file is sent the moment the script
       runs, and measured in a real panel it is simply lost: twelve seconds
       after a reload, with the button on screen and the store resolvable, no
       list had ever arrived. The first click asked again and the answer came
       back in 24ms - after the menu had been built, empty. That is the whole
       of "the first time I open it there is nothing in it".

       Half a second between attempts, and no cap: this only runs while there
       is no list at all, which is a state nothing works in. A cap would put
       the bug back in exactly the window where it hurts - an extension host
       busy for a few seconds at startup. */
    if (!listSeen && Date.now() - askedListAt > 500) {
      askedListAt = Date.now();
      requestList();
    }
    ensureButton();
    var busy = qApi() ? qApi().busy() : false;
    if (busy) { wasBusy = true; idleAt = 0; renderLane(); saveState(); return; }
    if (wasBusy) { wasBusy = false; idleAt = Date.now(); }
    if (idleAt && Date.now() - idleAt < SETTLE_MS) return;
    maybeRun();
    maybeSend();
    renderLane();
    saveState();
  }

  requestList();
  setInterval(function () { try { tick(); } catch (e) {} }, TICK);
})();</script>
