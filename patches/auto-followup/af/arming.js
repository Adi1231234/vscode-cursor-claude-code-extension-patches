  /* ---------- Arming ----------
     Starting, holding, continuing and ending. The tick next door decides when
     to ask and when to send; nothing here knows about either. */

  function arm(id) {
    armed = id;
    meta = findResponder(id);
    turns = 0; slot = null; stopped = null; approved = false; paused = false;
    stoppedId = null; extraTurns = 0;   /* arming from the menu starts a new count */
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

  /* Done, and then not. Continuing is the same arming carried on rather than a
     new one, which is the whole difference: no clearFirst, so a first_question
     already put is not put again; no turns = 0, so the count still says what
     this responder has done; and the claims and the questions already asked
     were never the arming's to clear anyway.

     Only a run that ended on its budget gets more budget. One that ended on
     its stop condition has turns to spare already, and adding more would
     silently raise a ceiling nobody reached. */
  function resume() {
    if (!stopped || !stoppedId) return;
    var id = stoppedId;
    armed = id; meta = findResponder(id);
    /* After meta is back, not before: baseTurns() reads it, and disarm had
       already set it to null. */
    var max = maxTurns();
    if (max && turns >= max) extraTurns += baseTurns();
    stopped = null; stoppedId = null; slot = null; approved = false; paused = false;
    /* Continuing is a play: the reply on screen is the one it answers. */
    lastSeen = "";
    try { localStorage.setItem(keyFor(ARM_KEY), id); } catch (e) {}
    log("resumed", id);
    renderAll();
  }

  function disarm(reason) {
    if (pending) cancelRun();
    stoppedId = armed || stoppedId;
    armed = null; meta = null; slot = null; pending = false; approved = false; paused = false;
    stopped = reason || null;
    try { localStorage.removeItem(keyFor(ARM_KEY)); } catch (e) {}
    log("disarmed", reason || "by hand");
    renderAll();
  }

