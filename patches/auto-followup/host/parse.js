/* AUTOFOLLOWUP host runtime - which object in the output is the answer.

   Its own part because it is its own failure surface. The reply is prose from a
   model, and every way it can be nearly-right has cost a turn. Getting a broken
   object to parse at all is mend.js next door; this file decides which of the
   objects present is the one the loop should act on.

   run.js unwraps the CLI's envelope; what arrives here is the model's own
   output. */
globalThis.__ccAfParse = globalThis.__ccAfParse || (function () {

  var QUOTE = String.fromCharCode(34), BS = String.fromCharCode(92);

  /* Every top-level {...} in the output, in order, plus what follows the last
     one.

     Brace counting rather than indexOf, because both of the cheap answers are
     wrong: the first brace to the last brace spans the prose sitting between two
     objects, and the last brace alone lets a stray {} at the end beat a whole
     answer. Quotes and escapes are tracked, so a brace inside a string counts
     for nothing.

     The tail matters because a reply cut off mid-string closes no braces at all,
     so it is not a chunk and the walk below would never see it. */
  function objects(out) {
    var s = out || "", res = [], depth = 0, start = -1, inStr = false, esc = false;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (c === BS) { esc = true; continue; }
        if (c === QUOTE) inStr = false;
        continue;
      }
      if (c === QUOTE) { inStr = true; continue; }
      if (c === "{") { if (depth === 0) start = i; depth++; continue; }
      if (c !== "}") continue;
      depth--;
      if (depth === 0 && start >= 0) { res.push(s.slice(start, i + 1)); start = -1; }
      else if (depth < 0) { depth = 0; start = -1; }
    }
    var last = res.length ? res[res.length - 1] : null;
    res.tail = last ? s.slice(s.lastIndexOf(last) + last.length) : s;
    return res;
  }

  /* The last object that carries a message.

     The model corrects itself out loud: one object, then a line of prose - "Wait,
     I must output exactly six keys. Let me correct." - then the real one. That
     was reported about thirty times, and every one of them was a follow-up
     written correctly and never sent: the parse failed, the turn was marked
     invalid, and the panel parks an invalid reply however autosend is set.

     Two things stop the walk rather than letting an earlier object answer, and
     both rest on the same point: the earlier object is the draft the model
     abandoned, and sending a draft as though it were the answer is worse than
     not sending, because a parked reply is visible and a wrong one is not. An
     answer started after the last complete one and cut off is one; an object
     that will not parse even mended is the other.

     An object that parses without a message - the CLI envelope, a stray {} - is
     passed over instead, because it is not a competing answer. */
  function extract(out) {
    var M = globalThis.__ccAfMend;
    /* Mended before the split, not after: a message ending in a backslash
       escapes the quote that closes it, and the brace counter is misled by
       exactly the same ambiguity the parser is. Each variant is tried whole,
       and the untouched text goes first so a valid reply is never rewritten. */
    var texts = [out, M.repair(out), M.closeStrings(out),
                 M.repair(M.closeStrings(out)), M.closeStrings(M.repair(out))];
    var any = null;
    for (var t = 0; t < texts.length; t++) {
      var chunks = objects(texts[t]);
      /* An answer started after the last complete one and cut off is the
         model's last word, so nothing earlier may stand in for it. Per variant
         rather than once at the top: an unclosed string leaves the whole output
         looking like a tail, and mending it is exactly what closes it. */
      if (chunks.tail.indexOf(QUOTE + "message" + QUOTE) >= 0) continue;
      for (var i = chunks.length - 1; i >= 0; i--) {
        var o;
        try { o = JSON.parse(chunks[i]); } catch (e) { break; }   /* next variant */
        if (!o || typeof o !== "object") continue;
        if (typeof o.message === "string") return o;
        if (!any) any = o;
      }
    }
    return any;
  }

  function list(v, cap) {
    if (!Array.isArray(v)) return [];
    return v.filter(function (x) { return typeof x === "string" && x.trim(); })
            .map(function (x) { return x.trim(); }).slice(0, cap);
  }

  function shape(parsed, raw) {
    if (!parsed || typeof parsed !== "object") {
      return { message: globalThis.__ccAfMend.salvage(raw) || (raw || "").trim(),
               why: "output was not JSON", claims: [], axes: [], plan: [],
               stop: null, invalid: true };
    }
    return {
      message: typeof parsed.message === "string" ? parsed.message.trim() : "",
      why: typeof parsed.why === "string" ? parsed.why.trim() : "",
      claims: list(parsed.claims, 12),
      axes: list(parsed.axes, 8),
      plan: list(parsed.plan, 12),
      stop: typeof parsed.stop === "string" && parsed.stop.trim() ? parsed.stop.trim() : null,
      invalid: false
    };
  }

  return { objects: objects, extract: extract, shape: shape,
           salvage: function (r) { return globalThis.__ccAfMend.salvage(r); } };
})();
