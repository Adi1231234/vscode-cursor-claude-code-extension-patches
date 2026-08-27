/* AUTOFOLLOWUP host runtime - the prompt one responder turn is given.

   Four fields, and every one is something the panel shows: 'message' is typed
   into the auto slot, 'why' is the grey line under it, 'claims' are appended to
   the ledger the next turn is given, and 'stop' is null while the loop continues
   and carries the reason when it ends. */
globalThis.__ccAfPrompt = globalThis.__ccAfPrompt || (function () {
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

  return { compose: compose, CONTRACT: CONTRACT };
})();
