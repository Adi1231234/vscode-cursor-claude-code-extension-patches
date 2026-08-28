  /* ---------- The three ledgers that are not claims ----------

     What the panel actually sent, which of the panel-chosen questions have been
     put, and which axes have been priced. All per session, all in localStorage,
     all written by the panel rather than reported by the responder - the one
     design that has worked here twice, after two that did not. */

  /* ---------- The other ledger: what the panel actually sent ----------
     The claims ledger records what Claude asserted. This one records what the
     responder sent, and the panel keeps it from its own send path - nothing is
     asked of the responder, because nothing can be. Two designs that did ask it
     both failed: told to return its still-open questions it reworded them every
     turn so nothing matched, and given ids to hand back it wrote a new question
     instead. It will not keep books; it will read what is put in front of it.

     Kept short on purpose. The point is to recognise "I asked this already", and
     the last few are enough for that. */
  function askedKey() {
    return keyFor(ASKED_KEY);
  }

  function readAsked() {
    try {
      var raw = localStorage.getItem(askedKey());
      var v = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  /* Whether the responder's first_question has been put yet, in this arming.
     Kept by the panel, not judged by the model: asked once, then never again.
     Whether the answer was any good is a separate matter and belongs to the
     ordinary rules, which is why this is a flag and not a judgement. */
  /* Which of them have been put, in this arming. The panel keeps the record and
     the responder file supplies the trigger, so nothing here knows or cares what
     kind of conversation this is. Whether the answer was any good is a separate
     matter and belongs to the ordinary rules - this is a flag, not a judgement. */
  function fired() {
    try { return JSON.parse(localStorage.getItem(keyFor(FIRST_KEY)) || "[]") || []; }
    catch (e) { return []; }
  }

  /* The decision lives in once.js and is shared with the measurement harness;
     what belongs here is only the ledger it is asked about. */
  function pendingOnce(r, text) {
    return __ccAfOnce.pending(r, text, fired());
  }

  function markOnceAsked(id) {
    var done = fired();
    if (done.indexOf(id) < 0) done.push(id);
    try { localStorage.setItem(keyFor(FIRST_KEY), JSON.stringify(done)); } catch (e) {}
  }

  /* The recurring questions: which one fired, and on which turn. A map rather
     than a list, because what decides the next firing is when the last one was
     and not whether it happened. Cleared with the once ledger, for the same
     reason: a new arming is a new search. */
  function everyLog() {
    try { return JSON.parse(localStorage.getItem(keyFor(EVERY_KEY)) || "{}") || {}; }
    catch (e) { return {}; }
  }

  function pendingEvery(r, text) {
    return __ccAfOnce.recurring(r, text, everyLog(), turns);
  }

  function markEveryAsked(id) {
    var log = everyLog();
    log[id] = turns;
    try { localStorage.setItem(keyFor(EVERY_KEY), JSON.stringify(log)); } catch (e) {}
  }

  /* The graveyard. An axis that was priced and set aside is the one thing a
     later turn cannot rediscover: the claims ledger holds the last few dozen
     assertions and on a long run that reaches back about twenty turns, so an
     axis closed in round four is invisible by round thirty. This one is not
     capped at anything a real session will reach, because the whole value of
     it is that it does not scroll.

     Appended, never rewritten. Asking the responder to return the whole list
     each turn is the design that failed twice for the open questions: a fresh
     process rewords everything, nothing matches, and the list grows forever.
     It returns what it priced this turn and the panel keeps the books. */
  function readAxes() {
    try {
      var raw = localStorage.getItem(keyFor(AXES_KEY));
      var v = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function addAxes(newOnes) {
    if (!newOnes || !newOnes.length) return;
    var have = readAxes();
    for (var i = 0; i < newOnes.length; i++) {
      var text = String(newOnes[i]).trim();
      /* Deduped on the text, not on the numbered line: the same verdict said
         again three turns later is not a second axis. A re-opened one comes
         back with a different verdict and different words, so it lands. */
      var seen = false;
      for (var j = 0; j < have.length; j++) {
        if (have[j].slice(have[j].indexOf("] ") + 2) === text) { seen = true; break; }
      }
      if (!seen) have.push("[" + turns + "] " + text);
    }
    try { localStorage.setItem(keyFor(AXES_KEY), JSON.stringify(have.slice(-MAX_AXES))); }
    catch (e) {}
  }

  function clearFirst() {
    try { localStorage.removeItem(keyFor(FIRST_KEY)); } catch (e) {}
    try { localStorage.removeItem(keyFor(EVERY_KEY)); } catch (e) {}
  }

  function recordAsked(text) {
    var t = String(text || "").trim();
    if (!t) return;
    var have = readAsked();
    have.push("[turn " + turns + "] " + t);
    try { localStorage.setItem(askedKey(), JSON.stringify(have.slice(-MAX_ASKED))); } catch (e) {}
  }

  function exportClaims() {
    var lines = readClaims();
    if (!lines.length) return false;
    send({ type: "__ccaf", op: "export", lines: lines });
    return true;
  }
