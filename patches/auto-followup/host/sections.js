/* AUTOFOLLOWUP host runtime - the two question sections, and only those.

   '## once' and '## every' are one parser and two firing rules, so they live
   together: a section that differs only in when it fires must not differ in how
   it is written. format.js owns the file; this owns these two blocks of it. */
globalThis.__ccAfSections = globalThis.__ccAfSections || (function () {
  var NL = String.fromCharCode(10);
  var KEYS = ["when", "ask", "name", "after", "turns"];

  /* '## once' - questions the panel asks at most once each, on the turn a
     pattern first matches Claude's message:

         when: [0-9]+ ?(s|sec|seconds)
         ask: what real input was that measured on?

     This exists because the highest-value question in a conversation is usually
     one that has to be asked at a particular moment and then never again, and a
     rule in '## rules' cannot express either half: the model decides when, and
     it will ask again next turn. Measured on eight real turning points, the same
     question moved from 0 of 4 to 4 of 4 once its trigger moved out of the
     model's hands and into a pattern.

     A pattern that does not compile is skipped rather than throwing - a bad
     regex in one entry must not take the responder down with it. */
  function parseOnce(text) {
    var out = [], cur = {}, last = "";
    function flush() { if (cur.when && cur.ask) out.push(cur); cur = {}; last = ""; }
    String(text || "").split(NL).forEach(function (raw) {
      var line = raw.trim();
      if (!line) return flush();
      var c = line.indexOf(":");
      var k = c > 0 ? line.slice(0, c).trim().toLowerCase() : "";
      if (KEYS.indexOf(k) >= 0) { cur[k] = line.slice(c + 1).trim(); last = k; return; }
      /* Anything else continues the field above it, so a question long enough to
         be worth asking can be wrapped rather than run off the edge of the file. */
      if (last) cur[last] += " " + line;
    });
    flush();
    return out;
  }

  function onceText(r) {
    if (!r.once || !r.once.length) return "";
    var body = r.once.map(function (e) {
      var out = [];
      if (e.name) out.push("name: " + e.name);
      out.push("when: " + e.when);
      if (e.after) out.push("after: " + e.after);
      out.push("ask: " + e.ask);
      return out.join(NL);
    }).join(NL + NL);
    return NL + NL + "## once" + NL + body;
  }

  /* The recurring list writes back the same way, with its cadence. Sharing the
     parser is deliberate: two sections that differ only in when they fire
     should not differ in how they are written. */
  function everyText(r) {
    if (!r.every || !r.every.length) return "";
    var body = r.every.map(function (e) {
      var out = [];
      if (e.name) out.push("name: " + e.name);
      if (e.turns) out.push("turns: " + e.turns);
      out.push("when: " + e.when);
      if (e.after) out.push("after: " + e.after);
      out.push("ask: " + e.ask);
      return out.join(NL);
    }).join(NL + NL);
    return NL + NL + "## every" + NL + body;
  }


  return { parseOnce: parseOnce, onceText: onceText, everyText: everyText };
})();
