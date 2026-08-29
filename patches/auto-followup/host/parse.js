/* AUTOFOLLOWUP host runtime - turning what the responder printed into a
   follow-up.

   Its own part because it is its own failure surface. The reply is prose from a
   model, and every way it can be nearly-right has cost a turn: two objects with
   an apology between them, a stray {} after the answer, an output cut off in the
   middle of a string. run.js unwraps the CLI's envelope; what arrives here is
   the model's own output. */
globalThis.__ccAfParse = globalThis.__ccAfParse || (function () {

  var QUOTE = String.fromCharCode(34), BS = String.fromCharCode(92);

  /* Every top-level {...} in the output, in order.

     Brace counting rather than indexOf, because both of the cheap answers are
     wrong: the first brace to the last brace spans the prose sitting between two
     objects, and the last brace alone lets a stray {} at the end beat a whole
     answer. Quotes and escapes are tracked, so a brace inside a string counts
     for nothing. */
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
    return res;
  }

  /* The last object that carries a message.

     The model corrects itself out loud: one object, then a line of prose - "Wait,
     I must output exactly six keys. Let me correct." - then the real one. That
     was reported about thirty times, and every one of them was a follow-up
     written correctly and never sent: the parse failed, the turn was marked
     invalid, and the panel parked it however autosend was set.

     A message is the one field the loop cannot do without, so an object with one
     beats an object without - which is also how the CLI's own envelope, which
     has no message, is still returned when it is the only thing present. */
  function extract(out) {
    var chunks = objects(out), any = null;
    for (var i = chunks.length - 1; i >= 0; i--) {
      var o;
      try { o = JSON.parse(chunks[i]); } catch (e) { continue; }
      if (!o || typeof o !== "object") continue;
      if (typeof o.message === "string") return o;
      if (!any) any = o;
    }
    return any;
  }

  /* When no object is whole, the message alone rather than the envelope.

     The whole raw output used to become the message, so a reply cut off in the
     middle put the ledger - why, claims, axes and plan - into the conversation as
     a prompt. Seen once for real: 5,866 characters of bookkeeping sent as a
     question, because one key came back as "ableToStop instead of ","stop". */
  function salvage(raw) {
    var s = raw || "";
    var k = s.indexOf(QUOTE + "message" + QUOTE);
    if (k < 0) return null;
    var q = s.indexOf(QUOTE, s.indexOf(":", k) + 1);
    if (q < 0) return null;
    /* Walked rather than matched: the string ends at the first quote that is not
       escaped, and the regex for that is the kind nobody can read. */
    for (var i = q + 1; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === BS) { i++; continue; }
      if (c !== QUOTE) continue;
      try { return JSON.parse(s.slice(q, i + 1)); } catch (e) { return null; }
    }
    return null;
  }

  function list(v, cap) {
    if (!Array.isArray(v)) return [];
    return v.filter(function (x) { return typeof x === "string" && x.trim(); })
            .map(function (x) { return x.trim(); }).slice(0, cap);
  }

  function shape(parsed, raw) {
    if (!parsed || typeof parsed !== "object") {
      return { message: salvage(raw) || (raw || "").trim(), why: "output was not JSON",
               claims: [], axes: [], plan: [], stop: null, invalid: true };
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

  return { objects: objects, extract: extract, salvage: salvage, shape: shape };
})();
