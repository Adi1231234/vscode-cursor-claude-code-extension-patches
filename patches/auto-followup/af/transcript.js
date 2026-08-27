  /* ---------- Reading the transcript ----------
     From the DOM, with the minified class names the patcher detects, exactly the
     way copy-message reads a message. NOT from a store signal: nothing in this
     repository reads a message list off the store, and an earlier version here
     assumed s.messages.value. That returns undefined, so lastAssistant() would
     have returned "" on every tick and the loop would never have fired once -
     silently, with every unit test still green, because the tests stubbed the
     shape the code assumed rather than the shape the app has.

     A message is the user's when it contains the user bubble; everything else is
     Claude's. Thinking blocks, tool calls and tool results are stripped, because
     a follow-up should answer what Claude said and not what it was thinking. */
  var MSG = ".__MSG__";
  var USERMSG = ".__USERMSG__";
  var NOTTEXT = ".__THINK__,.__TOOLUSE__,.__TOOLRES__";

  function messageNodes() {
    try { return Array.prototype.slice.call(document.querySelectorAll(MSG)); }
    catch (e) { return []; }
  }

  function isUser(m) {
    try { return !!m.querySelector(USERMSG); } catch (e) { return false; }
  }

  /* innerText on a clone with the non-text wrappers removed: innerText is the
     rendered text, so the blank lines between blocks survive - the same reason
     copy-message uses it - and the clone means the real node is never touched. */
  function textOf(m) {
    try {
      var body = m.querySelector(USERMSG) || m;
      var c = body.cloneNode(true);
      var drop = c.querySelectorAll(NOTTEXT);
      for (var i = 0; i < drop.length; i++) {
        if (drop[i].parentNode) drop[i].parentNode.removeChild(drop[i]);
      }
      return (c.innerText || c.textContent || "").trim();
    } catch (e) { return ""; }
  }

  function lastAssistant() {
    var ms = messageNodes();
    for (var i = ms.length - 1; i >= 0; i--) {
      if (isUser(ms[i])) continue;
      var t = textOf(ms[i]);
      if (t) return t;
    }
    return "";
  }

  /* The whole conversation as plain turns, for context: full-session. Capped from
     the end, because the recent part is what a follow-up is about and an
     unbounded transcript would grow the responder's cost without bound. */
  function transcript() {
    var out = [], ms = messageNodes();
    for (var i = 0; i < ms.length; i++) {
      var t = textOf(ms[i]);
      if (t) out.push((isUser(ms[i]) ? "HUMAN: " : "CLAUDE: ") + t);
    }
    var all = out.join(NL + NL);
    return all.length > MAX_TRANSCRIPT ? all.slice(-MAX_TRANSCRIPT) : all;
  }

