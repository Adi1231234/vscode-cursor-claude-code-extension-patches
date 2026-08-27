  /* ---------- The loop ----------
     One pass every TICK: notice a turn ending, ask the host for a follow-up, and
     send it when the lane is clear.

     Three brakes, and they are not the same brake. The stop condition the
     responder evaluates ends the task. max_turns ends the arming. The stop button
     ends it now - and it works here because the hook below has no condition on
     the queue being non-empty, which is what would have made it silently fail:
     the slot is filled *after* a turn ends, so at the moment stop is pressed
     there is often nothing queued at all. */
  /* Fails closed. meta is null for the moment between restoring an armed
     responder from localStorage and the host's list arriving, and answering
     "yes, send without asking" during that window would skip the one review the
     user asked for. Unknown means hold. */
  function autosend() {
    if (approved) return true;
    if (!meta) return false;
    return String(meta.autosend) === "true";
  }

  var approved = false;

  function arm(id) {
    armed = id;
    meta = findResponder(id);
    turns = 0; slot = null; stopped = null; approved = false;
    clearFirst();                          /* a new arming asks it again */
    lastSeen = lastAssistant();          /* the reply already on screen is not ours to answer */
    try { localStorage.setItem(keyFor(ARM_KEY), id); } catch (e) {}
    log("armed", id);
    renderAll();
  }

  function disarm(reason) {
    if (pending) cancelRun();
    armed = null; meta = null; slot = null; pending = false; approved = false;
    stopped = reason || null;
    try { localStorage.removeItem(keyFor(ARM_KEY)); } catch (e) {}
    log("disarmed", reason || "by hand");
    renderAll();
  }

  function contextFor() {
    var mode = (meta && meta.context) || "last-message+claims";
    var ctx = { text: lastAssistant(), cwd: cwdHint(), claims: [], asked: readAsked(),
                needFirst: !!(meta && (meta.first_question || "").trim()) && needFirst() };
    if (mode === "last-message+claims") ctx.claims = readClaims();
    else if (mode === "full-session") { ctx.claims = readClaims(); ctx.transcript = transcript(); }
    return ctx;
  }

  function onResult(m) {
    if (m.error) {
      slot = null;
      disarm(m.error);
      return;
    }
    turns += 1;
    if (m.claims && m.claims.length) addClaims(m.claims);
    if (m.stop) { slot = null; disarm(m.stop); return; }
    if (!m.message) { log("empty message, nothing to send"); renderAll(); return; }
    slot = { message: m.message, why: m.why || "", invalid: !!m.invalid };
    var max = maxTurns();
    if (max && turns >= max) log("last turn of", String(max));
    renderAll();
  }

  function maybeRun() {
    if (!armed || stopped || pending || slot) return;
    var api = qApi();
    if (!api || api.busy() || api.paused() || api.count()) return;   /* the user's lane wins */
    var max = maxTurns();
    if (max && turns >= max) { disarm("reached max_turns " + max); return; }
    var text = lastAssistant();
    if (!text || text === lastSeen) return;    /* nothing new to answer */
    lastSeen = text;
    var ctx = contextFor();
    if (ctx.needFirst) markFirstAsked();   /* asked once, whatever comes back */
    inflight = requestRun(armed, ctx);
    renderAll();
  }

  function maybeSend() {
    if (!slot || !armed || stopped) return;
    if (!autosend()) return;                   /* held for the first approval */
    var api = qApi();
    if (!api || api.busy() || api.paused() || api.count()) return;
    var text = slot.message;
    slot = null;
    recordAsked(text);          /* what was sent, so the next turn can see it */
    renderAll();
    Promise.resolve(api.send(text)).then(function (ok) {
      if (!ok) { slot = { message: text, why: "", invalid: false }; renderAll(); }
    });
  }

  /* Approving the first one is what releases the rest of this arming. */
  function approve() {
    approved = true;
    maybeSend();
  }
