  /* ---------- Reading the answer while it is still being written ----------

     What the model streams is the JSON the contract asks for, so the raw view was
     a wall of braces, escaped quotes and א sequences with the sentence that
     matters buried in the middle of it. The finished answer is parsed by the host
     and comes back as fields; while it is still being written nothing has parsed
     yet, and waiting until the end would leave the view showing braces for the
     twenty seconds a person is actually watching.

     So the one field worth reading is pulled out of the prefix as it arrives.
     This is not a JSON parser and does not try to be: it finds "message", takes
     the string that follows, and stops wherever the text stops - a half-written
     value is exactly what should be on screen at that moment.

     Not one backslash in this file. Every fragment here is injected inside a
     template literal, which eats them before the browser sees the script, so an
     escape written normally arrives as something else entirely. Hence the
     character codes. */
  var BS = String.fromCharCode(92);      /* backslash */
  var QT = String.fromCharCode(34);      /* double quote */

  function unescapeInto(src, from) {
    var out = "", i = from;
    while (i < src.length) {
      var ch = src.charAt(i);
      if (ch === QT) return { text: out, closed: true };
      if (ch !== BS) { out += ch; i++; continue; }
      var next = src.charAt(i + 1);
      if (next === "") return { text: out, closed: false };   /* cut mid-escape */
      if (next === "n") out += String.fromCharCode(10);
      else if (next === "r") out += String.fromCharCode(13);
      else if (next === "t") out += String.fromCharCode(9);
      else if (next === "u") {
        var hex = src.substr(i + 2, 4);
        if (hex.length < 4) return { text: out, closed: false };
        var code = parseInt(hex, 16);
        out += isFinite(code) ? String.fromCharCode(code) : "";
        i += 6;
        continue;
      } else out += next;                                     /* " and the rest */
      i += 2;
    }
    return { text: out, closed: false };
  }

  /* The value of a top-level string field, or null when it has not started yet.
     "partial" says the stream stopped inside it, which is the normal state while
     a run is in flight. */
  function jsonField(buf, name) {
    var key = QT + name + QT;
    var at = buf.indexOf(key);
    if (at < 0) return null;
    var i = buf.indexOf(":", at + key.length);
    if (i < 0) return null;
    i++;
    while (i < buf.length && buf.charAt(i) !== QT) {
      var c = buf.charAt(i);
      if (c !== " " && c !== String.fromCharCode(9) && c !== String.fromCharCode(10)
          && c !== String.fromCharCode(13)) return null;      /* not a string field */
      i++;
    }
    if (i >= buf.length) return null;
    var r = unescapeInto(buf, i + 1);
    return { text: r.text, partial: !r.closed };
  }

  /* Everything the output deltas have said so far, joined - the model writes one
     JSON document per turn, so this is that document, complete or not. */
  function liveRaw() {
    var out = "";
    for (var i = 0; i < liveParts.length; i++) {
      if (liveParts[i].kind !== "thinking") out += liveParts[i].text;
    }
    return out;
  }

  function liveThinking() {
    var out = "";
    for (var i = 0; i < liveParts.length; i++) {
      if (liveParts[i].kind === "thinking") out += liveParts[i].text;
    }
    return out;
  }
