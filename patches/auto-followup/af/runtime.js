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
    sid = now;
    armed = null; meta = null; slot = null; stopped = null; turns = 0; pending = false;
    try {
      var saved = localStorage.getItem(keyFor(ARM_KEY));
      if (saved) {
        armed = saved;
        meta = findResponder(saved);
        lastSeen = lastAssistant();
        /* The list may not have arrived yet, and until it does maxTurns and the
           approval gate have nothing to read. Ask again rather than run blind. */
        if (!meta) requestList();
      }
    } catch (e) {}
    renderAll();
  }

  function tick() {
    syncSession();
    hookStop();
    ensureButton();
    var busy = qApi() ? qApi().busy() : false;
    if (busy) { wasBusy = true; idleAt = 0; renderLane(); return; }
    if (wasBusy) { wasBusy = false; idleAt = Date.now(); }
    if (idleAt && Date.now() - idleAt < SETTLE_MS) return;
    maybeRun();
    maybeSend();
    renderLane();
  }

  requestList();
  setInterval(function () { try { tick(); } catch (e) {} }, TICK);
})();</script>
