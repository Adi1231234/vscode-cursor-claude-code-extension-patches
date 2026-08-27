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
  var DEFAULTS = {
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
    r.rules = section(body, "rules");
    r.stop = section(body, "stop");
    if (!r.rules && !r.stop) r.rules = body.trim();
    return r;
  }

  function serialize(r) {
    var head = ["---", "name: " + (r.name || r.id), "description: " + (r.description || "")];
    Object.keys(DEFAULTS).forEach(function (k) { head.push(k + ": " + (r[k] || DEFAULTS[k])); });
    Object.keys(r.extra || {}).forEach(function (k) { head.push(k + ": " + r.extra[k]); });
    head.push("---", "");
    return head.join("\n") + "\n## rules\n" + (r.rules || "").trim() +
           "\n\n## stop\n" + (r.stop || "").trim() + "\n";
  }

  return { parse: parse, serialize: serialize, DEFAULTS: DEFAULTS };
})();
