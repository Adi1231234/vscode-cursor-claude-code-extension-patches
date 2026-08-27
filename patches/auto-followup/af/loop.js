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

  /* ---------- Reading the transcript ----------
     From the DOM, with the minified class names the patcher detects, exactly the
     way copy-message reads a message. NOT from a store signal: nothing in this
     repository reads a message list off the store, and an earlier version here
     assumed s.messages.value. That returns undefined, so lastAssistant() would
     have returned "" on every tick and the loop would never have fired once -
     silently, with every unit test still green, because the tests stubbed the
     shape the code assumed rather than the shape the app has.

     A message is the user's when it contains the user bubble; everything else is
     Claude's. Thinking blocks, tool calls and tool results are stripped, because
     a follow-up should answer what Claude said and not what it was thinking. */
  var MSG = ".__MSG__";
  var USERMSG = ".__USERMSG__";
  var NOTTEXT = ".__THINK__,.__TOOLUSE__,.__TOOLRES__";

  function messageNodes() {
    try { return Array.prototype.slice.call(document.querySelectorAll(MSG)); }
    catch (e) { return []; }
  }

  function isUser(m) {
    try { return !!m.querySelector(USERMSG); } catch (e) { return false; }
  }

  /* innerText on a clone with the non-text wrappers removed: innerText is the
     rendered text, so the blank lines between blocks survive - the same reason
     copy-message uses it - and the clone means the real node is never touched. */
  function textOf(m) {
    try {
      var body = m.querySelector(USERMSG) || m;
      var c = body.cloneNode(true);
      var drop = c.querySelectorAll(NOTTEXT);
      for (var i = 0; i < drop.length; i++) {
        if (drop[i].parentNode) drop[i].parentNode.removeChild(drop[i]);
      }
      return (c.innerText || c.textContent || "").trim();
    } catch (e) { return ""; }
  }

  function lastAssistant() {
    var ms = messageNodes();
    for (var i = ms.length - 1; i >= 0; i--) {
      if (isUser(ms[i])) continue;
      var t = textOf(ms[i]);
      if (t) return t;
    }
    return "";
  }

  /* The whole conversation as plain turns, for context: full-session. Capped from
     the end, because the recent part is what a follow-up is about and an
     unbounded transcript would grow the responder's cost without bound. */
  function transcript() {
    var out = [], ms = messageNodes();
    for (var i = 0; i < ms.length; i++) {
      var t = textOf(ms[i]);
      if (t) out.push((isUser(ms[i]) ? "HUMAN: " : "CLAUDE: ") + t);
    }
    var all = out.join(NL + NL);
    return all.length > MAX_TRANSCRIPT ? all.slice(-MAX_TRANSCRIPT) : all;
  }

  function contextFor() {
    var mode = (meta && meta.context) || "last-message+claims";
    var ctx = { text: lastAssistant(), cwd: cwdHint(), claims: [] };
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
