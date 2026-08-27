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
   more valuable than a turn lost to a missing brace, and the log records it so a
   responder that does this every time is visible rather than merely slow. */
globalThis.__ccAfRun = globalThis.__ccAfRun || (function () {
  var cp = require("child_process"), os = require("os");

  var TIMEOUT_MS = 180000;      /* a hung CLI must not wedge the loop forever */
  var MAX_OUT = 1048576;

  var CONTRACT = [
    "You are writing the human's next message in an ongoing conversation with Claude.",
    "You are NOT talking to the human and you are NOT Claude. Your whole output is the",
    "message that will be typed into the composer, plus bookkeeping.",
    "",
    "Answer with JSON only, exactly these four keys:",
    '  "message" - the text to send. Write it as the human would: direct, short,',
    "              in the language the human has been using.",
    '  "why"     - one short clause naming the rule you applied. The human reads',
    "              this to judge you, so name the trigger, not the intent.",
    '  "claims"  - factual assertions or numbers Claude stated in the message you',
    "              were given, as short strings. [] when there are none.",
    '  "stop"    - null to continue, or a short reason when the stop condition is met.',
    "",
    "When you return a stop reason, 'message' is ignored and nothing is sent."
  ].join("\n");

  function compose(r, ctx) {
    var p = [CONTRACT, "", "# When to type what", (r.rules || "").trim()];
    if ((r.stop || "").trim()) p.push("", "# When to stop", r.stop.trim());
    if (ctx.claims && ctx.claims.length) {
      p.push("", "# What Claude has already asserted this session",
             "Each line is one earlier claim. Use them to catch a contradiction with",
             "the message below. You were not given the reasoning behind them.",
             ctx.claims.join("\n"));
    }
    /* context: full-session. Deliberately last and deliberately labelled: a
       responder given the reasoning tends to be persuaded by it, so a responder
       that asks for this is choosing depth over independence and should be able
       to see that it did. */
    if (ctx.transcript) {
      p.push("", "# The conversation so far", ctx.transcript.trim());
    }
    p.push("", "# Claude's message, which you are answering", (ctx.text || "").trim());
    return p.join("\n");
  }

  /* Outermost braces, so a fenced or prefaced object still parses. */
  function extract(out) {
    var a = out.indexOf("{"), b = out.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(out.slice(a, b + 1)); } catch (e) { return null; }
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
    var args = ["-p"];
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
      done(shape(extract(out), out));
    });

    try { child.stdin.end(compose(r, ctx || {})); } catch (e) {}
    return child;
  }

  return { run: run, compose: compose };
})();
