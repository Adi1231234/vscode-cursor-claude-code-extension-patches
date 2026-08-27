  /* ---------- What survives a window reload ----------

     A reload is a fresh script against the same localStorage, and until this
     existed only the arming came back. The turn count went to 0, so the
     max_turns brake started again from nothing; an answer written but not yet
     approved was gone; a stop reason stopped being on the button; and a released
     approval re-armed itself, holding the next message from someone who had
     already said go.

     The one thing that must not come back unconditionally is that answer. It was
     written for one message, and sending it three turns later answers a
     conversation that has moved on - which is why the queue patch does not
     restore held items either. So the message it was written for is stored
     beside it, and it is restored only while that message is still the last
     thing Claude said. Anything else is dropped.

     A run that was in flight is not restored and cannot be: the child belongs to
     the host, it answers a rid that no longer has a panel, and the result is
     dropped. The turn it was answering is already in lastSeen, so the loop does
     not re-ask - the cost of a reload mid-run is that one follow-up. */

  var lastWritten = "";

  function stateKey() { return keyFor(STATE_KEY); }

  function saveState() {
    /* Nothing armed and nothing stopped is nothing to say. Clearing the key
       rather than writing an empty one keeps a stale slot from outliving the
       arming that produced it. */
    if (!armed && !stopped) {
      if (lastWritten === "") return;
      lastWritten = "";
      try { localStorage.removeItem(stateKey()); } catch (e) {}
      return;
    }
    var snap, payload;
    try {
      payload = { turns: turns, slot: slot, slotFor: slot ? lastSeen : "",
                  stopped: stopped, approved: approved, paused: paused, lastSeen: lastSeen,
                  fp: fingerprint() };
      snap = JSON.stringify(payload);
    } catch (e) { return; }
    /* Written from tick(), so it runs three times a second: comparing first is
       what keeps that from being three writes a second. */
    if (snap === lastWritten) return;
    lastWritten = snap;
    /* The timestamp is written but never compared: including it in the snapshot
       would make every tick a fresh string and every tick a write. */
    payload.at = Date.now();
    try { localStorage.setItem(stateKey(), JSON.stringify(payload)); } catch (e) {}
  }

  function restoreState(carried) {
    var raw = null;
    try { raw = localStorage.getItem(stateKey()); } catch (e) { return; }
    if (!raw) { lastWritten = ""; return; }
    var o = null;
    try { o = JSON.parse(raw); } catch (e) { return; }
    if (!o || typeof o !== "object") return;
    lastWritten = raw;

    if (typeof o.turns === "number" && o.turns >= 0) turns = o.turns;
    if (typeof o.stopped === "string" && o.stopped) stopped = o.stopped;
    approved = o.approved === true;
    /* Everything comes back except the permission to act on it. A window that
       reopens is a window nobody has looked at yet: the conversation may have
       moved on while it was closed, the person may have opened it to read rather
       than to continue, and a loop that starts typing on its own the moment an
       editor comes up is a loop nobody asked for at that moment. So the arming,
       the count, the ledgers and the waiting answer all return, and the loop
       returns held. One click on Resume starts it, and by then it is a decision
       rather than a side effect of opening a window.

       The exception is a panel whose session has just been given its id: the
       keys were carried over from "none" a moment ago, nobody reopened
       anything, and forcing a pause there undoes an arming made seconds
       earlier - measured by arming an empty chat and then typing into it. */
    paused = carried ? (o.paused === true) : true;
    if (typeof o.lastSeen === "string") lastSeen = o.lastSeen;

    if (o.slot && typeof o.slot === "object" && typeof o.slot.message === "string") {
      var now = "";
      try { now = lastAssistant(); } catch (e) {}
      if (o.slotFor && o.slotFor === now) slot = o.slot;
      else log("dropped a follow-up written for a message that is no longer the last one");
    }
  }

  /* ---------- The same conversation, a new session id ----------

     A window reload brings the conversation back - and gives it a NEW session
     id. Measured in a real editor: armed under fbf2bf72, reloaded, the same two
     messages on screen and the title unchanged, and the panel now calling itself
     c08c5113. Every key here is per session id, so the arming, the claims ledger
     and the state above were all orphaned by that alone, and the button came back
     off. That, not the variables, is why an auto follow-up did not survive a
     reload.

     So the identity that matters is the conversation, and what names it is its
     opening: the first thing the user asked and the first thing Claude answered.
     Neither changes for the life of the conversation. A session that arrives with
     no arming of its own looks for a stored state whose opening matches what is
     on screen, and takes its keys over.

     It moves them rather than copying them: a copy left behind is a second claim
     on the same conversation, and the next reload would have two to choose
     between. It only ever fires for a session that has no arming of its own, so a
     panel that is already armed is never adopted into something else. */

  var CARRIED = [CLAIM_KEY, ASKED_KEY, FIRST_KEY, ARM_KEY, STATE_KEY];

  function fingerprint() {
    var ms = messageNodes(), user = "", bot = "";
    for (var i = 0; i < ms.length; i++) {
      var t = textOf(ms[i]);
      if (!t) continue;
      if (isUser(ms[i])) { if (!user) user = t; }
      else if (!bot) bot = t;
      if (user && bot) break;
    }
    if (!user) return "";
    return user.slice(0, 200) + String.fromCharCode(0) + bot.slice(0, 120);
  }

  function adopt() {
    var fp = fingerprint();
    if (!fp) return false;
    /* length/key(i) rather than Object.keys: the stored items are own properties
       of a real Storage and enumerating it does work in the webview, but this is
       the API the thing actually has, and it is the one a stub can model. */
    var keys = [], n = 0;
    try { n = localStorage.length || 0; } catch (e) { return false; }
    for (var k = 0; k < n; k++) {
      try { keys.push(localStorage.key(k)); } catch (e) {}
    }
    var best = null;
    for (var i = 0; i < keys.length; i++) {
      if (!keys[i] || keys[i].indexOf(STATE_KEY) !== 0) continue;
      var was = keys[i].slice(STATE_KEY.length);
      if (!was || was === (sid || "none")) continue;
      var o = null;
      try { o = JSON.parse(localStorage.getItem(keys[i])); } catch (e) { continue; }
      if (!o || o.fp !== fp) continue;
      if (!best || (o.at || 0) > best.at) best = { id: was, at: o.at || 0 };
    }
    if (!best) return false;
    for (var j = 0; j < CARRIED.length; j++) {
      try {
        var v = localStorage.getItem(CARRIED[j] + best.id);
        if (v === null) continue;
        localStorage.setItem(keyFor(CARRIED[j]), v);
        localStorage.removeItem(CARRIED[j] + best.id);
      } catch (e) {}
    }
    log("same conversation under a new session id - carried the arming and the ledger over");
    return true;
  }
