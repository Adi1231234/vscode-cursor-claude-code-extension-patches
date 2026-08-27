/* AUTOFOLLOWUP - which once-question fires on a message, and nothing else.

   Pure: the ledger of what has already been put is passed in, so this file can be
   run outside a browser. That is the point of it. The measurement harness has to
   work out the same thing to know which calls an edit can possibly change, and
   when it had its own copy of these rules the copy went stale - an ordering added
   here did not exist there, so a run reported the old behaviour in 0.4 seconds and
   looked like a fast confirmation. */
var __ccAfOnce = (function () {

  /* Keyed by the question, not by its position in the list. By position,
     switching responder mid-session made the new one's first question count as
     already asked, and so did editing the list. By content, a question that has
     been reworded is one that has not been asked, which is what someone editing
     the file expects. */
  function idFor(ask) {
    var h = 5381, s = String(ask);
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return "q" + h.toString(36);
  }

  /* 'after: <name>' - a question that only makes sense once another has been put.

     Measured without it, "by what factor can this be cut" fired on the first
     message carrying a percentage, which twice was a turn where the point was
     that a measurement was wrong. A factor is a factor of something, so that
     question is worth asking only after the one establishing what the number
     measures - and that is an ordering, not a sharper pattern.

     An 'after' naming an entry that does not exist blocks nothing: a typo should
     cost the ordering, not the question. */
  function ready(list, entry, done) {
    var need = String(entry.after || "").trim().toLowerCase();
    if (!need) return true;
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].name || "").trim().toLowerCase() !== need) continue;
      return done.indexOf(idFor(String(list[i].ask || "").trim())) >= 0;
    }
    return true;
  }

  /* done: array of ids already put. Returns {id, ask} or null. */
  function pending(r, text, done) {
    if (!r) return null;
    var t = String(text || "");
    var fq = (r.first_question || "").trim();
    if (fq && done.indexOf(idFor(fq)) < 0) return { id: idFor(fq), ask: fq };
    var list = r.once || [];
    for (var i = 0; i < list.length; i++) {
      var ask = String(list[i].ask || "").trim();
      if (!ask || done.indexOf(idFor(ask)) >= 0) continue;
      if (!ready(list, list[i], done)) continue;
      var re;
      try { re = new RegExp(list[i].when, "i"); } catch (e) { continue; }
      if (re.test(t)) return { id: idFor(ask), ask: ask };
    }
    return null;
  }

  return { idFor: idFor, pending: pending };
})();
if (typeof module !== "undefined" && module.exports) module.exports = __ccAfOnce;
