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

  /* A panel armed before its session exists stores under "none", and the id
     arriving afterwards is not a new session - it is the same one, finally
     identified. Without this the arming vanished the moment the first prompt was
     sent: the button went back to "off" with the responder still selected and
     nothing in the log to say why.

     Found by arming a real panel. None of the unit tests could see it, because
     every one of them starts from a session that already has an id. */
  function carryOver(was) {
    if (was) return false;              /* one real id replacing another is a new session */
    var moved = false;
    [CLAIM_KEY, ASKED_KEY, FIRST_KEY, ARM_KEY, STATE_KEY].forEach(function (p) {
      try {
        var v = localStorage.getItem(p + "none");
        if (v === null) return;
        localStorage.setItem(keyFor(p), v);
        localStorage.removeItem(p + "none");
        moved = true;
      } catch (e) {}
    });
    return moved;
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

