/* AUTOFOLLOWUP host runtime - the prompt, changed without reloading a window.

   Everything else about a responder is a file, read on every run, so an edit
   takes effect on the next turn. The composition itself was not: it lives in the
   bundle, the bundle is read when the extension host starts, and one window
   reloading does not reload the others. So a change to what the prompt is made
   of took a reload in every open window, and a reload is the thing nobody
   remembers to do everywhere.

   So the folder that already holds the responders may also hold a `_prompt.js`,
   and when it does, its compose is used. It is the same shape as `prompt.js`
   here - copying that file into place is the whole operation - and it is
   re-read whenever its mtime moves.

   It fails to the built-in, always and quietly in the prompt itself: a
   composition that throws is a turn that does nothing, and nothing is worse than
   an older prompt. `status()` says what happened for anyone asking why their
   override is not taking. */
globalThis.__ccAfHot = globalThis.__ccAfHot || (function () {
  var fs = require("fs"), path = require("path"), os = require("os");
  var last = { at: 0, fn: null, err: "", from: "" };

  function file() {
    var base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
    return path.join(base, "responders", "_prompt.js");
  }

  /* mtime, not content: a read per run is already the cost of the folder, and a
     hash of a file this size on every turn buys nothing over a timestamp. */
  function loaded() {
    var f = file(), st = null;
    try { st = fs.statSync(f); }
    catch (e) { last = { at: 0, fn: null, err: "", from: "" }; return null; }
    if (last.fn && last.at === st.mtimeMs) return last.fn;
    var fn = null, err = "";
    try {
      var g = {};
      (new Function("globalThis", "module", "exports", "require",
                    fs.readFileSync(f, "utf8")))(g, {}, {}, require);
      fn = g.__ccAfPrompt && g.__ccAfPrompt.compose;
      if (typeof fn !== "function") { fn = null; err = "no __ccAfPrompt.compose in it"; }
    } catch (e) { fn = null; err = String((e && e.message) || e); }
    last = { at: st.mtimeMs, fn: fn, err: err, from: f };
    return fn;
  }

  function compose(r, ctx) {
    var fn = loaded();
    if (fn) {
      try {
        var out = fn(r, ctx);
        /* An empty prompt is a failure that looks like a success, so it is one. */
        if (typeof out === "string" && out.trim()) return out;
        last.err = "returned nothing";
      } catch (e) { last.err = String((e && e.message) || e); }
    }
    return globalThis.__ccAfPrompt.compose(r, ctx);
  }

  return { compose: compose, file: file, status: function () { return last; } };
})();
