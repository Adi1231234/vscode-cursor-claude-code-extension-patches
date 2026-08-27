/* AUTOFOLLOWUP host runtime - part 1: the responder file format.

   A responder is one markdown file. The parser is deliberately forgiving, because
   a person edits these by hand and a prompt that fails to load is indistinguishable
   from a prompt that does nothing:

       ---
       name: perf-skeptic
       description: challenges measurements
       context: last-message+claims        (or last-message / full-session)
       max_turns: 20                       (or 'unlimited')
       autosend: false
       model: sonnet
       ---

       ## rules
       <what to type, given what Claude just wrote>

       ## stop
       <the condition that ends the loop>

   Two properties worth keeping:

   Unknown front-matter keys are preserved and written back, so a field added by a
   later version of this patch survives being edited by an older one.

   A file with no '## rules' heading at all still works - the whole body becomes
   the rules. Someone writing their first responder should not have to know the
   section names to get one running. */
globalThis.__ccAfFormat = globalThis.__ccAfFormat || (function () {
  var NL = String.fromCharCode(10);
  var KEYS = ["when", "ask", "name", "after"];
  var DEFAULTS = {
    first_question: "",
    context: "last-message+claims",
    max_turns: "20",
    autosend: "false",
    model: "sonnet"
  };

  function section(body, tag) {
    var re = new RegExp("^##[ \\t]*" + tag + "[ \\t]*$", "mi");
    var m = re.exec(body);
    if (!m) return "";
    var rest = body.slice(m.index + m[0].length);
    var next = /^##[ \t]/m.exec(rest);
    return (next ? rest.slice(0, next.index) : rest).trim();
  }

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

  function parse(id, text) {
    var meta = {}, body = text;
    var fm = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(text);
    if (fm) {
      body = text.slice(fm[0].length);
      fm[1].split(/\r?\n/).forEach(function (line) {
        var c = line.indexOf(":");
        if (c <= 0) return;
        meta[line.slice(0, c).trim()] = line.slice(c + 1).trim();
      });
    }
    var r = { id: id, extra: {} };
    Object.keys(meta).forEach(function (k) {
      if (k === "name" || k === "description" || DEFAULTS.hasOwnProperty(k)) return;
      r.extra[k] = meta[k];
    });
    r.name = meta.name || id;
    r.description = meta.description || "";
    Object.keys(DEFAULTS).forEach(function (k) { r[k] = meta[k] || DEFAULTS[k]; });
    r.goal = section(body, "goal");
    r.rules = section(body, "rules");
    r.once = parseOnce(section(body, "once"));
    r.stop = section(body, "stop");
    if (!r.rules && !r.stop && !r.goal) r.rules = body.trim();
    return r;
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

  var L_RULES = NL + "## rules" + NL;
  var L_STOP = NL + NL + "## stop" + NL;

  function goalText(r) {
    return (r.goal || "").trim() ? NL + "## goal" + NL + r.goal.trim() + NL : "";
  }

  function serialize(r) {
    var head = ["---", "name: " + (r.name || r.id), "description: " + (r.description || "")];
    Object.keys(DEFAULTS).forEach(function (k) { head.push(k + ": " + (r[k] || DEFAULTS[k])); });
    Object.keys(r.extra || {}).forEach(function (k) { head.push(k + ": " + r.extra[k]); });
    head.push("---", "");
    return head.join(NL) + goalText(r) + L_RULES + (r.rules || "").trim() +
           onceText(r) +
           "\n\n## stop\n" + (r.stop || "").trim() + "\n";
  }

  return { parse: parse, serialize: serialize, DEFAULTS: DEFAULTS };
})();
