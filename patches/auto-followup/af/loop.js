  /* ---------- The loop ----------
     One pass every TICK: notice a turn ending, ask the host for a follow-up, and
     send it when the lane is clear.

     Three brakes, and they are not the same brake. The stop condition the
     responder evaluates ends the task. max_turns ends the arming. The stop button
     ends it now - and it works here because the hook below has no condition on
     the queue being non-empty, which is what would have made it silently fail:
     the slot is filled *after* a turn ends, so at the moment stop is pressed
     there is often nothing queued at all. */
  function autosend() {
    return !meta || String(meta.autosend) === "true" || approved;
  }

  var approved = false;

  function arm(id) {
    armed = id;
    meta = findResponder(id);
    turns = 0; slot = null; stopped = null; approved = false;
    lastSeen = lastAssistant();          /* the reply already on screen is not ours to answer */
    try { localStorage.setItem(ARM_KEY + sid, id); } catch (e) {}
    log("armed", id);
    renderAll();
  }

  function disarm(reason) {
    if (pending) cancelRun();
    armed = null; meta = null; slot = null; pending = false; approved = false;
    stopped = reason || null;
    try { localStorage.removeItem(ARM_KEY + sid); } catch (e) {}
    log("disarmed", reason || "by hand");
    renderAll();
  }

  /* The visible text of the last assistant message. Signals first, because that is
     what the app itself reads; the transcript DOM is the fallback for a build
     whose store shape has moved. */
  function lastAssistant() {
    try {
      var s = globalThis.__ccStore();
      var ms = s && s.messages && s.messages.value;
      if (Array.isArray(ms)) {
        for (var i = ms.length - 1; i >= 0; i--) {
          var m = ms[i];
          if (!m || m.role !== "assistant") continue;
          var c = m.content;
          if (typeof c === "string") return c;
          if (Array.isArray(c)) {
            return c.filter(function (b) { return b && b.type === "text"; })
                    .map(function (b) { return b.text || ""; }).join("\n");
          }
        }
      }
    } catch (e) {}
    return "";
  }

  function contextFor() {
    var mode = (meta && meta.context) || "last-message+claims";
    var ctx = { text: lastAssistant(), cwd: cwdHint(), claims: [] };
    if (mode === "last-message+claims") ctx.claims = readClaims();
    else if (mode === "full-session") { ctx.claims = readClaims(); ctx.full = true; }
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
    inflight = requestRun(armed, contextFor());
    renderAll();
  }

  function maybeSend() {
    if (!slot || !armed || stopped) return;
    if (!autosend()) return;                   /* held for the first approval */
    var api = qApi();
    if (!api || api.busy() || api.paused() || api.count()) return;
    var text = slot.message;
    slot = null;
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
