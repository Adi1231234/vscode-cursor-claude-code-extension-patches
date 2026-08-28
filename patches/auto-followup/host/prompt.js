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
    "Answer with JSON only, exactly these six keys:",
    '  "message" - the text to send. Write it as the human would: direct, short,',
    "              in the language the human has been using.",
    '  "why"     - one short clause naming the rule you applied. The human reads',
    "              this to judge you, so name the trigger, not the intent.",
    '  "claims"  - factual assertions or numbers Claude stated in the message you',
    "              were given, as short strings. [] when there are none.",
    '  "axes"    - any axis you priced this turn, one short line each: what it is,',
    "              what it is worth, and what killed it if it is dead. [] when",
    "              there are none - the panel keeps them, you only add.",
    '  "plan"    - what is open, in the order you will work it, item one first.',
    "              Return the whole list every turn you change it: close item one",
    "              when it is done and the rest moves up. [] leaves it as it was.",
    '  "stop"    - null to continue, or a short reason when the stop condition is met.',
    "",
    "When you return a stop reason, 'message' is ignored and nothing is sent."
  ].join("\n");

  /* The one question that has to be asked before anything else, on the turn the
     panel says it has not been asked yet.

     It used to be the first paragraph of the rules, as prose competing with four
     other rules for the model's attention, and measured on the message where it
     mattered most in this project it fired 3 times out of 6 - a coin flip on the
     highest-value move there is. When it lost, the model read the same message as
     "a finding, then a stop" and said "what is the next axis" instead.

     So the panel decides when, and the model is left only the wording. Same
     principle as the sent-message ledger: whatever the mechanism can decide, the
     mechanism decides.

     Gating it on the first armed turn was still the model's problem wearing a
     mechanism's clothes. The turn it is needed on is not turn one - across eight
     real turning points it came around turn forty - so the trigger is a pattern
     in the responder file ('## once'), and the question fires the turn that
     pattern first matches. Measured on the moment that reframed the whole
     project: 0 of 4 on the turn gate, 4 of 4 on the pattern. */
  function firstQuestion(r, ctx) {
    if (ctx.once && (ctx.once.ask || "").trim()) return ctx.once.ask.trim();
    return (ctx.needFirst && (r.first_question || "").trim()) || "";
  }

  /* What the loop is for, stated once and put above everything else.

     Without it the prompt was a format contract, a list of moves and a stop
     condition, and nothing anywhere said what any of it was in service of. That
     is enough to pick a reasonable move turn by turn and not enough to choose
     between two moves that both fit, which is most turns. It also left the stop
     condition referring to a target that was never stated.

     It goes above the rules deliberately: a rule says what to type, the goal says
     which rule matters. */
  function goalOf(r) {
    var g = (r.goal || "").trim();
    return g ? ["# What you are trying to get to", g, ""] : [];
  }

  /* The plan, first of everything the responder is handed, because it is the
     only part that says what this loop is in the middle of.

     Sequential prompting loses the goal: early high-level thoughts drift out of
     a long history and the loop stops working what it decided to work (Zhang et
     al., ReCAP, arXiv:2510.23822, +32% pass@1 from re-injecting the plan). This
     is that re-injection. Measured on a run of this loop before it existed: five
     routes were demanded three times and none of the fifteen was ever priced. */
  function planBlock(ctx) {
    if (!ctx.plan || !ctx.plan.length) return [];
    var out = ["", "# The plan, item one first"];
    for (var i = 0; i < ctx.plan.length; i++) out.push((i + 1) + ". " + ctx.plan[i]);
    return out.concat([
      "",
      "Item one is what this turn is for, unless what Claude just wrote closes it or",
      "changes what it should be. Do not open a sixth thing while one is open: say",
      "what item one needs next, or say it is closed and why, and let the rest move",
      "up. Return the list in 'plan' whenever it changes."
    ]);
  }

  function askedBlock(ctx) {
    var p = [];
    if (ctx.asked && ctx.asked.length) {
      p.push("", "# What you have already sent, oldest first",
             ctx.asked.join("\n"),
             "",
             "You wrote those. If what you are about to send asks for the same thing",
             "as one of them, then it was asked and not answered, and asking a third",
             "time in new words is how that goes on forever. Say plainly that it is",
             "the Nth time, name the exact thing you asked for, and ask for that or",
             "for an admission that it is not available - or drop it and say in 'why'",
             "that you dropped it and why. Do not repeat yourself in silence.");
    }
    return p;
  }

  function compose(r, ctx) {
    var first = firstQuestion(r, ctx);
    if (first) {
      return [CONTRACT, ""].concat(goalOf(r)).concat(planBlock(ctx)).concat([
        "# This turn has exactly one job",
        "Ask this, and nothing else:",
        "    " + first,
        "",
        "Put it in your own words, in the language of the conversation, and tie it to",
        "the specific numbers in the message below so it does not read as boilerplate.",
        "Ask nothing else this turn, however tempting the rest of the message is - it",
        "will still be there next turn, and the answer to this changes which of it",
        "matters. 'stop' is null.",
        "",
        /* The one thing this branch was missing. A question the panel repeats on a
           cadence had no way to see that it had just been asked: this branch is the
           contract, the goal, the question and the message, and nothing else.
           Measured on a real run, the same demand for five routes went out three
           times in forty-five minutes, each time discarding the answer to the last
           and adding to a list of what was forbidden. */
      ]).concat(askedBlock(ctx)).concat([
        "",
        "# Claude's message", (ctx.text || "").trim()
      ]).join("\n");
    }
    var p = [CONTRACT, ""].concat(goalOf(r))
              .concat(["# When to type what", (r.rules || "").trim()]);
    if ((r.stop || "").trim()) p.push("", "# When to stop", r.stop.trim());
    /* The graveyard, above the claims, because it decides what is worth a turn
       and they only decide whether a number is right.

       It is uncapped where the claims are not. Measured on a ten-hour run, no
       turn could see further back than twenty-three rounds of sixty-seven, so
       an axis priced and closed in round four was invisible for the rest of the
       night and the loop kept working it. This list is small enough not to
       scroll, and it is the only thing here that remembers the shape of the
       search rather than its assertions. */
    if (ctx.axes && ctx.axes.length) {
      p.push("", "# Axes already priced, oldest first",
             "What has been weighed and what killed it. Do not re-open one of these",
             "for a better measurement of the same number. Do re-open one whose",
             "killer was a decision somebody made, the moment that decision moves -",
             "and say that is why you are re-opening it.",
             ctx.axes.join(String.fromCharCode(10)));
    }
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
    /* What was actually sent, from the panel's own record rather than anything
       the responder reports about itself.

       Two designs failed before this one, and both failed the same way. Asking it
       to return the questions still open produced a freshly worded question every
       turn, so nothing matched and the count stayed at one. Giving each one an id
       and asking for the id back produced o1, o2, o3, o4 - it wrote a new question
       instead of returning the id it had been handed. A fresh process will not
       keep books. It will read what is put in front of it. */
    p = p.concat(planBlock(ctx)).concat(askedBlock(ctx));
    p.push("", "# Claude's message, which you are answering", (ctx.text || "").trim());
    return p.join("\n");
  }

  return { compose: compose, CONTRACT: CONTRACT };
})();
