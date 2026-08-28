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
       model: opus
       effort: max
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
  var DEFAULTS = {
    first_question: "",
    context: "last-message+claims",
    max_turns: "20",
    autosend: "false",
    model: "opus",
    /* The pair a responder gets unless it says otherwise. This is the second
       reader in the room and the whole point of it is to catch what the first
       one missed, so it is given the strongest model and the longest thinking
       rather than the cheapest. It costs: measured on one turn of perf-skeptic
       at sonnet, low answered in 125 output tokens and 8.7 s and max in 3043
       and 44.5 s. A responder that only has to notice a number can be turned
       down in its own file, and "default" as an effort passes no flag at all.
       An older file that names neither key reads as this pair too. */
    effort: "max"
  };

  function section(body, tag) {
    var re = new RegExp("^##[ \\t]*" + tag + "[ \\t]*$", "mi");
    var m = re.exec(body);
    if (!m) return "";
    var rest = body.slice(m.index + m[0].length);
    var next = /^##[ \t]/m.exec(rest);
    return (next ? rest.slice(0, next.index) : rest).trim();
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
    r.once = globalThis.__ccAfSections.parseOnce(section(body, "once"));
    r.every = globalThis.__ccAfSections.parseOnce(section(body, "every"));   /* same shape, plus turns */
    r.stop = section(body, "stop");
    if (!r.rules && !r.stop && !r.goal) r.rules = body.trim();
    return r;
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
           globalThis.__ccAfSections.onceText(r) + globalThis.__ccAfSections.everyText(r) +
           "\n\n## stop\n" + (r.stop || "").trim() + "\n";
  }

  /* The editor edits the section as written; the loop reads the parsed list. The
     panel is given both and parses neither, so '## once' means one thing. */
  function onceToText(list) {
    return globalThis.__ccAfSections.onceText({ once: list })
      .replace(NL + NL + "## once" + NL, "");
  }

  function everyToText(list) {
    return globalThis.__ccAfSections.everyText({ every: list })
      .replace(NL + NL + "## every" + NL, "");
  }

  return { parse: parse, serialize: serialize, DEFAULTS: DEFAULTS,
           onceToText: onceToText, everyToText: everyToText,
           parseOnce: globalThis.__ccAfSections.parseOnce };
})();
