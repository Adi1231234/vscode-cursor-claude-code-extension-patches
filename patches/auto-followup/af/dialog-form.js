  /* ---------- Manage responders: the edit pane ----------
     Name and description on top, then the four settings, then two prompt boxes.

     The two boxes are separate on purpose. When 'when to stop' was one line
     inside a twenty-line prompt it was easy to write a responder and never notice
     the field existed - and a responder with no stop condition and max_turns
     unlimited has no brake but the stop button. Given its own labelled box it
     cannot be missed.

     'context' is the field that decides what the responder is worth. Given the
     full session it reads Claude's reasoning and is persuaded by it; given the
     last message plus the claims ledger it can still catch a contradiction
     without having been argued at. */
  var CONTEXTS = [
    ["last-message", "only what Claude said last"],
    ["last-message+claims", "and the claims recorded earlier, without the reasoning"],
    ["full-session", "the whole conversation"]
  ];
  /* The third element marks a row that is typed into rather than chosen. The
     other lists have none, so nothing else changes. */
  var MAXES = [["20", ""], ["50", ""],
               ["unlimited", "until the stop condition is met"],
               ["custom", "any number of turns", "free"]];
  var TOGGLE = [["false", "shows you the message first"], ["true", "sends without stopping"]];
  var MODELS = [["sonnet", ""], ["opus", ""], ["haiku", ""]];
  /* How hard the model is asked to think, not which model. The two are
     independent: a cheap model at high effort and an expensive one at low are
     both reasonable answers to "this responder only has to notice a number".
     "default" passes no flag at all and leaves the CLI's own setting alone. */
  var EFFORTS = [
    ["default", "whatever the CLI is set to"],
    ["low", "a quick read"], ["medium", ""], ["high", ""],
    ["xhigh", ""], ["max", "thinks the longest, costs the most"]
  ];

  function markDirty() { dirty = true; }

  function textInput(cls, value, ph, set) {
    var i = el("input", cls);
    i.type = "text";
    i.value = value || "";
    i.placeholder = ph || "";
    i.addEventListener("input", function () { set(i.value); markDirty(); });
    i.addEventListener("keydown", function (ev) { ev.stopPropagation(); });
    return i;
  }

  function box(title, hint, value, set, cls, placeholder) {
    var wrap = el("div", "__afBox" + (cls ? " " + cls : ""));
    var head = el("div", "__afBoxHead");
    head.dir = "auto";
    txt(head, title);
    if (hint) { var s = el("span"); txt(s, hint); head.appendChild(s); }
    wrap.appendChild(head);
    var ta = el("textarea", "__afTa __ccScroll");
    ta.dir = "auto";
    /* An empty section used to be an empty box with a heading. The placeholder
       is the only thing that says what belongs in it. */
    if (placeholder) ta.placeholder = placeholder;
    ta.value = value || "";
    ta.spellcheck = false;
    ta.addEventListener("input", function () { set(ta.value); markDirty(); });
    ta.addEventListener("keydown", function (ev) { ev.stopPropagation(); });
    wrap.appendChild(ta);
    return wrap;
  }

  function editPane() {
    var pane = el("div", "__afPane __afEdit __ccScroll");
    /* Under it, because it is the same shape and a different firing rule: the
       questions here come back on a cadence. Without a box they would still
       work and still be saved, and nobody would ever see them. */
    pane.appendChild(box("Ask again", "every few turns, whenever the pattern matches",
      draft.everyText, function (v) { draft.everyText = v; }, "__afOnce __afMono",
      ["name: five", "turns: 3", "when: [0-9]",
       "ask: five ways this could be 5x?"].join(NL)));
    if (!draft) return pane;

    var idrow = el("div", "__afIdRow");
    var nameWrap = el("span", "__afFi");
    var nl = el("label"); txt(nl, "name"); nameWrap.appendChild(nl);
    nameWrap.appendChild(textInput("__afIn __afMono", draft.name, "perf-skeptic", function (v) {
      draft.name = v;
      /* The filename follows the name only while the file does not exist yet;
         renaming a saved responder would orphan the old file. */
      if (draft.isNew) draft.id = (v || "responder").toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "responder";
    }));
    var descWrap = el("span", "__afFi __afWide");
    var dl = el("label"); txt(dl, "description"); descWrap.appendChild(dl);
    descWrap.appendChild(textInput("__afIn", draft.description, "what this responder does",
      function (v) { draft.description = v; }));
    idrow.appendChild(nameWrap);
    idrow.appendChild(descWrap);
    pane.appendChild(idrow);

    var fields = el("div", "__afFields");
    fields.appendChild(field("context", draft.context, CONTEXTS, function (v) { draft.context = v; }));
    fields.appendChild(field("max_turns", draft.max_turns, MAXES, function (v) { draft.max_turns = v; }));
    fields.appendChild(field("autosend", draft.autosend === "true" ? "true" : "false", TOGGLE,
      function (v) { draft.autosend = v; }));
    fields.appendChild(field("model", draft.model, MODELS, function (v) { draft.model = v; }));
    fields.appendChild(field("effort", draft.effort || "default", EFFORTS,
      function (v) { draft.effort = v; }));
    pane.appendChild(fields);

    /* The four sections of the file, in the order the prompt is built from them,
       so the dialog reads as the thing it edits. Two of them - the goal and the
       once chain - had no field at all: they survived a save because serialize
       writes them back untouched, which meant the dialog quietly showed half a
       responder and nothing said so.

       The two short prose sections share a row because they are short and the
       dialog is wide. Rules and the once chain each take the full width - one
       because it is what anybody actually writes in, the other because its lines
       are when/ask pairs that wrap badly in half a pane. */
    var pair = el("div", "__afPair");
    pair.appendChild(box("Goal", "read first, before the rules", draft.goal,
      function (v) { draft.goal = v; }, "__afShort",
      "what this loop is for, in a sentence or two"));
    pair.appendChild(box("Stop when", "ends the loop", draft.stop,
      function (v) { draft.stop = v; }, "__afShort",
      "the condition where there is nothing left worth asking"));
    pane.appendChild(pair);

    pane.appendChild(box("What to type", "given exactly what Claude just wrote",
      draft.rules, function (v) { draft.rules = v; }, "__afGrow",
      "a situation, then the move it calls for, on the line under it"));

    pane.appendChild(box("Ask once", "on the turn its pattern first matches, then never again",
      draft.onceText, function (v) { draft.onceText = v; }, "__afOnce __afMono",
      ["name: frame", "when: [0-9]+ ?s", "after: ", "ask: what was that measured on?"].join(NL)));
    return pane;
  }
