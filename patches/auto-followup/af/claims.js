  /* ---------- The claims ledger ----------
     What Claude has asserted this session, as short lines, without the reasoning
     that came with them. It exists for one job: letting the responder notice that
     turn 5 said "identical" and turn 11 says "3% different", which it cannot do
     from the last message alone.

     Why the responder writes it and not Claude. Claude is the only participant
     with file tools, so "have it written to a file" means Claude keeps the record
     of its own claims - and then the party being checked decides what goes into
     the record. The responder returns the claims in the same call that produces
     the message, so the ledger costs no extra model call and is not written by
     its subject.

     Stored per session, in localStorage, the same store and the same keying the
     queue uses for its items. It is a cue and not an archive: MAX_CLAIMS keeps the
     oldest lines falling off rather than growing the prompt without bound. */
  /* Both per-session stores key the same way, through here. sid is empty for the
     moment before the first tick reads it, and on any build that does not expose a
     session id at all; without the fallback those conversations would share one
     key and read each other's state. */
  function keyFor(prefix) {
    return prefix + (sid || "none");
  }

  function claimsKey() {
    return keyFor(CLAIM_KEY);
  }

  function readClaims() {
    try {
      var raw = localStorage.getItem(claimsKey());
      var v = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function writeClaims(lines) {
    try {
      if (!lines || !lines.length) localStorage.removeItem(claimsKey());
      else localStorage.setItem(claimsKey(), JSON.stringify(lines.slice(-MAX_CLAIMS)));
    } catch (e) {}
  }

  /* Numbered by the turn that produced them, because the number is what makes a
     contradiction legible: "[5] identical" against "[11] 3% different" says where
     to look, and a bare pair of claims does not. */
  /* Strips the "[7] " a stored line carries, so the same assertion is recognised
     whichever turn recorded it. Written with indexOf rather than a regex because
     the escapes a regex needs here do not survive the template literal - see the
     note in the config section. */
  function unnumbered(line) {
    var c = line.indexOf("] ");
    return (line.charAt(0) === "[" && c > 0) ? line.slice(c + 2) : line;
  }

  function addClaims(newOnes) {
    if (!newOnes || !newOnes.length) return;
    var have = readClaims();
    var seen = {};
    have.forEach(function (l) { seen[unnumbered(l)] = 1; });
    newOnes.forEach(function (c) {
      var body = String(c).trim();
      if (!body || seen[body]) return;         /* the same assertion restated is not new */
      seen[body] = 1;
      have.push("[" + turns + "] " + body);
    });
    writeClaims(have);
  }

  function clearClaims() {
    writeClaims([]);
    try { localStorage.removeItem(keyFor(ASKED_KEY)); } catch (e) {}
  }

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

  function pendingOnce(r, text) {
    if (!r) return null;
    var done = fired(), t = String(text || "");
    var fq = (r.first_question || "").trim();
    if (fq && done.indexOf(idFor(fq)) < 0) return { id: idFor(fq), ask: fq };
    var list = r.once || [];
    for (var i = 0; i < list.length; i++) {
      var ask = String(list[i].ask || "").trim();
      if (!ask || done.indexOf(idFor(ask)) >= 0) continue;
      var re;
      try { re = new RegExp(list[i].when, "i"); } catch (e) { continue; }
      if (re.test(t)) return { id: idFor(ask), ask: ask };
    }
    return null;
  }

  /* Keyed by the question, not by its position in the list.

     By position, switching responder mid-session made the new one's first
     question count as already asked - and so did editing the list, because
     entry 0 is entry 0 whatever it now says. By content, a question that has
     changed is a question that has not been asked, which is the behaviour a
     person editing the file expects. */
  function idFor(ask) {
    var h = 5381, s = String(ask);
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return "q" + h.toString(36);
  }

  function markOnceAsked(id) {
    var done = fired();
    if (done.indexOf(id) < 0) done.push(id);
    try { localStorage.setItem(keyFor(FIRST_KEY), JSON.stringify(done)); } catch (e) {}
  }

  function clearFirst() {
    try { localStorage.removeItem(keyFor(FIRST_KEY)); } catch (e) {}
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
