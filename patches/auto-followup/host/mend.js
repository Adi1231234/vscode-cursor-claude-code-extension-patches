/* AUTOFOLLOWUP host runtime - mending a reply that is nearly JSON.

   Separate from parse.js because it answers a different question: that one finds
   which object is the answer, this one gets an object to parse at all. Every
   repair here stands for turns that were written correctly and thrown away. */
globalThis.__ccAfMend = globalThis.__ccAfMend || (function () {

  var QUOTE = String.fromCharCode(34), BS = String.fromCharCode(92);
  var CLOSE = String.fromCharCode(125), WS = " " + String.fromCharCode(9, 10, 13);

  /* A backslash that starts no valid escape is the commonest way a model breaks
     its own JSON: a regex or a Windows path written with one backslash where
     JSON needs two. Escaping those and parsing again recovers the object.
     Nothing else is touched. */
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

  /* A message that ends in a backslash escapes the quote meant to close it, and
     the two are the same three characters. So when a repaired object still does
     not parse, a backslash sitting before a quote that is followed by a comma, a
     brace or a bracket is read as a literal one instead. That is what a Windows
     path at the end of a sentence produces, and this project writes paths
     constantly.

     An escaped quote inside a sentence is not touched: the character after it is
     a letter, or the quote that ends the string, never a separator. */
  function closeStrings(text) {
    var s = text || "", out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === BS && s.charAt(i + 1) === QUOTE) {
        var j = i + 2;
        while (j < s.length && WS.indexOf(s.charAt(j)) >= 0) j++;
        var nx = s.charAt(j);
        if (nx === "," || nx === CLOSE || nx === "]" || j >= s.length) {
          out += BS + BS + QUOTE;
          i++;
          continue;
        }
      }
      out += c;
    }
    return out;
  }


  /* When no object can be parsed at all, the message alone rather than the
     envelope. The whole raw output used to become the message, so a broken reply
     put the ledger - why, claims, axes and plan - into the conversation as a
     prompt. Seen for real: 5,866 characters of bookkeeping sent as a question.

     The last "message" in the output, not the first, for the same reason extract
     prefers the last object: the first is the draft the model abandoned. */
  function salvage(raw) {
    var s = raw || "";
    var k = s.lastIndexOf(QUOTE + "message" + QUOTE);
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
    /* No closing quote: the reply stopped inside the message. The rest is the
       message as far as it got, which still beats handing over the envelope. */
    var body = s.slice(q + 1);
    if (body.charAt(body.length - 1) === BS) body = body.slice(0, -1);
    try { return JSON.parse(QUOTE + body + QUOTE); } catch (e) {}
    return body || null;
  }

  return { repair: repair, closeStrings: closeStrings, salvage: salvage };
})();
