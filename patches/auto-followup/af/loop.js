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
    turns = 0; slot = null; stopped = null; approved = false; paused = false;
    clearFirst();                          /* a new arming asks it again */
    /* Play means start now. It used to set lastSeen to whatever was on screen,
       so arming did nothing until the next reply arrived - which meant sending
       Claude a message yourself and waiting for it to finish before the loop
       you had just started did anything at all. Now the reply that is on screen
       when you press play is the one it answers, and if the last thing in the
       conversation is your own message there is nothing to answer yet and it
       waits, which is the same wait as before. */
    lastSeen = "";
    try { localStorage.setItem(keyFor(ARM_KEY), id); } catch (e) {}
    log("armed", id);
    renderAll();
  }

  /* Held, not turned off. The difference matters: turning it off loses the
     turn count, the arming and the once-ledger, and getting them back means
     arming again from the menu. A pause is for the ordinary case of wanting to
     say something yourself for a turn or two.

     Resuming is a play too, so it does not touch lastSeen: whatever Claude
     said while the loop was held is answered as soon as it comes back. Only if
     nothing new was said - the last reply is the one already answered - does it
     wait, which is right.

     A follow-up that was waiting when the pause started is dropped unless it is
     still answering the last thing Claude said, for the reason the queue does
     not restore held items: a message written three turns ago is answering a
     conversation that has moved on. */
  function setPaused(v) {
    var was = paused;
    paused = !!v;
    if (was === paused) return;
    if (!paused) {
      if (slot && lastSeen !== lastAssistant()) slot = null;
    }
    log(paused ? "paused" : "resumed");
    renderAll();
  }

  function disarm(reason) {
    if (pending) cancelRun();
    armed = null; meta = null; slot = null; pending = false; approved = false; paused = false;
    stopped = reason || null;
    try { localStorage.removeItem(keyFor(ARM_KEY)); } catch (e) {}
    log("disarmed", reason || "by hand");
    renderAll();
  }

  function contextFor() {
    var mode = (meta && meta.context) || "last-message+claims";
    var reply = lastAssistant();
    var ctx = { text: reply, cwd: cwdHint(), claims: [], asked: readAsked(),
                once: pendingOnce(meta, reply) };
    ctx.needFirst = !!ctx.once;
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
    if (!armed || stopped || pending || slot || paused) return;
    var api = qApi();
    if (!api || api.busy() || api.paused() || api.count()) return;   /* the user's lane wins */
    var max = maxTurns();
    if (max && turns >= max) { disarm("reached max_turns " + max); return; }
    var text = lastAssistant();
    if (!text || text === lastSeen) return;    /* nothing new to answer */
    lastSeen = text;
    var ctx = contextFor();
    if (ctx.once) markOnceAsked(ctx.once.id);   /* asked once, whatever comes back */
    inflight = requestRun(armed, ctx);
    try { liveReset(inflight); } catch (e) {}
    renderAll();
  }

  function maybeSend() {
    /* A pause holds what the loop does on its own. Pressing play is not the
       loop acting, it is you, so an approval already given still goes - the
       alternative is a play button that silently does nothing. */
    if (paused && !approved) return;
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
