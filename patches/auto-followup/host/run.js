/* AUTOFOLLOWUP host runtime - part 2: running one responder turn.

   Spawns the Claude CLI in print mode with the composed prompt on stdin. The CLI
   rather than a direct API call, for two reasons: no second credential to store
   anywhere, and the model choice is the one the user already has configured.

   The contract is four fields, and every one of them is something the panel
   shows: 'message' is typed into the auto slot, 'why' is the grey line under it,
   'claims' are appended to the ledger the next turn is given, and 'stop' is null
   while the loop continues and carries the reason when it ends.

   A model asked for JSON sometimes wraps it in prose or a fence, so the parse
   takes the outermost braces rather than trusting the whole of stdout. If that
   still fails the turn is NOT dropped: the raw output becomes the message and the
   panel marks the line invalid. A responder that answers usefully in prose is
   more valuable than a turn lost to a missing brace.

   That fallback is deliberately NOT extended to the CLI's own failures - see
   unwrap(). prompt.js composes what is sent. */
globalThis.__ccAfRun = globalThis.__ccAfRun || (function () {
  var cp = require("child_process"), os = require("os");

  var TIMEOUT_MS = 180000;      /* a hung CLI must not wedge the loop forever */
  var MAX_OUT = 1048576;

  /* Outermost braces, so a fenced or prefaced object still parses. */
  function extract(out) {
    var a = out.indexOf("{"), b = out.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(out.slice(a, b + 1)); } catch (e) { return null; }
  }

  /* The CLI's own envelope, asked for with --output-format json.

     This exists because the CLI reports its own failures as ordinary prose on
     stdout with exit code 0: a token refresh in flight prints
     "Not logged in - Please run /login" and returns 0. Without the envelope that
     string is indistinguishable from a model answer, and the prose fallback
     below would have typed it into the conversation as the user's next message -
     while they were away, with the loop carrying on afterwards. Seen once for
     real during testing, and it is a runtime condition rather than a setup
     problem, so it will happen again.

     is_error and subtype separate the two cases the raw text cannot. */
  function unwrap(out) {
    var env = extract(out);
    if (!env || env.type !== "result") return { cli: null, text: out };
    if (env.is_error || env.subtype !== "success") {
      return { cli: String(env.result || env.subtype || "the CLI reported an error").trim() };
    }
    return { cli: null, text: typeof env.result === "string" ? env.result : "" };
  }

  function shape(parsed, raw) {
    if (!parsed || typeof parsed !== "object") {
      return { message: (raw || "").trim(), why: "output was not JSON", claims: [],
               stop: null, invalid: true };
    }
    var claims = Array.isArray(parsed.claims) ? parsed.claims : [];
    return {
      message: typeof parsed.message === "string" ? parsed.message.trim() : "",
      why: typeof parsed.why === "string" ? parsed.why.trim() : "",
      claims: claims.filter(function (c) { return typeof c === "string" && c.trim(); })
                    .map(function (c) { return c.trim(); }).slice(0, 12),
      stop: typeof parsed.stop === "string" && parsed.stop.trim() ? parsed.stop.trim() : null,
      invalid: false
    };
  }

  /* cwd matters only so the CLI has somewhere valid to start; the responder is
     given its context explicitly and is not meant to read the project. */
  function cwdFor(hint) {
    try {
      var fs = require("fs");
      if (hint && fs.statSync(hint).isDirectory()) return hint;
    } catch (e) {}
    return os.homedir();
  }

  function run(r, ctx, done) {
    var args = ["-p", "--output-format", "json"];
    if (r.model) args.push("--model", r.model);
    var child;
    try {
      child = cp.spawn("claude", args, {
        cwd: cwdFor(ctx && ctx.cwd), shell: process.platform === "win32",
        windowsHide: true, env: process.env
      });
    } catch (e) {
      done({ error: "could not start the claude CLI: " + (e && e.message) });
      return null;
    }
    var out = "", err = "", finished = false;
    var timer = setTimeout(function () { try { child.kill(); } catch (e) {} }, TIMEOUT_MS);

    child.stdout.on("data", function (d) { if (out.length < MAX_OUT) out += d.toString(); });
    child.stderr.on("data", function (d) { if (err.length < 8192) err += d.toString(); });
    child.on("error", function (e) {
      if (finished) return;
      finished = true; clearTimeout(timer);
      done({ error: "claude CLI failed to run: " + (e && e.message) });
    });
    child.on("close", function (code) {
      if (finished) return;
      finished = true; clearTimeout(timer);
      if (!out.trim()) {
        done({ error: "the responder returned nothing" + (code ? " (exit " + code + ")" : "") +
                      (err.trim() ? ": " + err.trim().slice(0, 300) : "") });
        return;
      }
      var u = unwrap(out);
      /* A CLI-level failure is an error, never a message. It ends the arming with
         the reason on the button, which is the honest outcome: nothing is typed
         into the conversation on the strength of a string nobody can vouch for. */
      if (u.cli) { done({ error: u.cli.slice(0, 300) }); return; }
      done(shape(extract(u.text), u.text));
    });

    try { child.stdin.end(globalThis.__ccAfPrompt.compose(r, ctx || {})); } catch (e) {}
    return child;
  }

  return { run: run, unwrap: unwrap, extract: extract, shape: shape,
           compose: function (r, c) { return globalThis.__ccAfPrompt.compose(r, c); } };
})();
