/* Shared webview runtime: what Claude actually wrote, told apart from the rows
   the app draws the same way.

   A local command's output (/queue, /context ...) and the "Remote Control is
   active" notice are drawn exactly like a reply - the same message and
   timelineMessage classes, the same data-testid="assistant-message" - so a
   patch reading the DOM takes them for one. Measured 2026-10-04 in the store's
   own message list (session.messages.value, 2.1.287), each row says what it is:
     a reply           type "assistant", with model ("claude-opus-5-5")
     the RC notice     type "assistant", isSynthetic: true
     command output    type "assistant", isSynthesizedByLoop: true, right after
                       the user row "<command-name>/queue</command-name>..."
   isSynthesizedByLoop is only "model === '<synthetic>'", which the CLI also
   writes for an API error, a usage limit or "No response requested." - those
   follow a real prompt, and they are news the person wants, so only a
   synthetic row answering a command row counts as a command's output.
   A stop leaves a user row reading "[Request interrupted by user]" (or "...
   for tool use") - wherever it came from, the phone included - unless the CLI
   was shutting down (interruptedByShutdown). A transcript row carries its
   message's uuid as data-bookmark-uuid.

   A mark is the set of rows there were, not a position: the store trims its
   list (past 600 rows it drops the oldest 100), and a position taken before a
   trim points into the run's own rows after it. A row is known by its uuid,
   or by the row itself where it has none - a reply stopped mid-thought leaves
   its "thinking" row without one, and counted as new on every later run it
   made each /queue look like a reply (measured 2026-10-04).

   Every function takes the store (or falls back to __ccStore()) and answers
   null when it cannot read it, so a caller keeps its old behaviour then rather
   than going dark. Injected by more than one patch; the first one in wins. */
window.__ccReply = window.__ccReply || (function () {
  var STOPPED = ["[Request interrupted by user]", "[Request interrupted by user for tool use]"];
  var COMMAND = "<command-name>";

  function list(store) {
    try {
      var s = store || (globalThis.__ccStore && globalThis.__ccStore());
      var m = s && s.messages;
      return m && Array.isArray(m.value) ? m.value : null;
    } catch (e) {
      return null;
    }
  }

  function texts(m) {
    return (m.content || []).map(function (c) { return (c && c.content && c.content.text) || ""; });
  }

  /* The user row a synthetic row answers is a command: then it is that
     command's output. A reply from a model in between means it is not. */
  function isCommandOutput(l, i) {
    if (!l[i].isSynthesizedByLoop) return false;
    for (var j = i - 1; j >= 0; j--) {
      if (l[j].type === "assistant" && !l[j].isSynthesizedByLoop && !l[j].isSynthetic) return false;
      if (l[j].type === "user") return texts(l[j]).some(function (t) { return t.indexOf(COMMAND) >= 0; });
    }
    return false;
  }

  function isClaude(l, i) {
    var m = l[i];
    return !!m && m.type === "assistant" && !m.isSynthetic && !isCommandOutput(l, i);
  }

  function isStop(m) {
    return m.type === "user" && !m.interruptedByShutdown &&
      texts(m).some(function (t) { return STOPPED.indexOf(t) >= 0; });
  }

  var key = function (m) { return m.uuid || m; };

  /* The rows there are now: a mark to compare with later. */
  function mark(store) {
    var l = list(store);
    if (!l) return null;
    var seen = new Set();
    for (var i = 0; i < l.length; i++) seen.add(key(l[i]));
    return seen;
  }

  /* Since mark: did Claude write anything, and did someone stop the turn? */
  function since(at, store) {
    var l = list(store);
    if (!l || !at || typeof at.has !== "function") return null;
    var out = { replied: false, stopped: false };
    for (var i = 0; i < l.length; i++) {
      if (at.has(key(l[i]))) continue;
      if (isClaude(l, i)) out.replied = true;
      if (isStop(l[i])) out.stopped = true;
    }
    return out;
  }

  /* Is this transcript row one of Claude's replies? */
  function isClaudeRow(row, store) {
    var id = row && row.getAttribute ? row.getAttribute("data-bookmark-uuid") : null;
    var l = list(store);
    if (!id || !l) return null;
    for (var i = l.length - 1; i >= 0; i--) {
      if (l[i].uuid === id) return isClaude(l, i);
    }
    return null;
  }

  return { mark: mark, since: since, isClaudeRow: isClaudeRow };
})();
