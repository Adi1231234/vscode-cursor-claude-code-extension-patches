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
    /* What is left after the last complete object. A reply cut off mid-string
       closes no braces, so it is not a chunk at all and the walk below would
       never see it - it would answer with the draft above it instead. */
    res.tail = res.length ? s.slice(s.lastIndexOf(res[res.length - 1]) + res[res.length - 1].length) : s;
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
  /* A backslash that starts no valid escape is the commonest way a model breaks
     its own JSON: a regex or a Windows path written with one backslash where
     JSON needs two. Escaping those and parsing again recovers the object.
     Nothing else is touched, and a repair that still does not parse leaves the
     reply invalid, which is the honest outcome. */
  function repair(text) {
    var s = text || "", out = "", inStr = false, valid = QUOTE + BS + "/bfnrtu";
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (!inStr) { out += c; if (c === QUOTE) inStr = true; continue; }
      if (c === QUOTE) { out += c; inStr = false; continue; }
      if (c !== BS) { out += c; continue; }
      var n = s.charAt(i + 1);
      if (n && valid.indexOf(n) >= 0) { out += c + n; i++; continue; }
      out += BS + BS;
    }
    return out;
  }

  function parseOne(chunk) {
    try { return JSON.parse(chunk); } catch (e) {}
    try { return JSON.parse(repair(chunk)); } catch (e) {}
    return undefined;    /* told apart from a parsed null */
  }

  /* The last object that carries a message.

     The model corrects itself out loud: one object, then a line of prose -
     "Wait, I must output exactly six keys. Let me correct." - then the real
     one. That was reported about thirty times, and every one of them was a
     follow-up written correctly and never sent: the parse failed, the turn was
     marked invalid, and the panel parks an invalid reply however autosend is
     set.

     An object that does not parse at all stops the walk rather than letting an
     earlier one win. The earlier one is the draft the model abandoned, and
     sending a draft as though it were the answer is worse than not sending: a
     parked reply is visible, a wrong one is not. An object that parses without
     a message - the CLI envelope, a stray {} after the answer - is passed
     over, because it is not a competing answer. */
  function extract(out) {
    var chunks = objects(out), any = null;
    /* An answer was started after the last complete one and did not finish.
       That truncated one is the model's last word, so nothing earlier may
       stand in for it: salvage recovers its message and the reply is parked,
       which is visible, where a silently sent draft is not. */
    if (chunks.tail.indexOf(QUOTE + "message" + QUOTE) >= 0) return null;
    for (var i = chunks.length - 1; i >= 0; i--) {
      var o = parseOne(chunks[i]);
      if (o === undefined) return null;
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
    var k = s.lastIndexOf(QUOTE + "message" + QUOTE);   /* the last word, as above */
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
    /* No closing quote: the reply stopped inside the message. The rest of it is
       the message as far as it got, which is still better than handing the
       whole envelope to the conversation. */
    var body = s.slice(q + 1);
    if (body.charAt(body.length - 1) === BS) body = body.slice(0, -1);
    try { return JSON.parse(QUOTE + body + QUOTE); } catch (e) {}
    return body || null;
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
