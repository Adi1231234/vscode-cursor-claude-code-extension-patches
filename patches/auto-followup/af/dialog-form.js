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
  var MAXES = [["20", ""], ["50", ""], ["unlimited", "until the stop condition is met"]];
  var TOGGLE = [["false", "shows you the message first"], ["true", "sends without stopping"]];
  var MODELS = [["sonnet", ""], ["opus", ""], ["haiku", ""]];

  function markDirty() { dirty = true; }

  function field(label, value, opts, set) {
    var f = el("span", "__afF");
    var l = el("label"); txt(l, label); f.appendChild(l);
    /* Label over value, and the chevron beside the value rather than at the far
       end of the row. It used to be one flex row with space-between, which put a
       wide and uneven gutter between a label and the thing it labels - the case
       NN/G names as the one where a side label stops being read in a single
       fixation. */
    var v = el("span", "__afFVal"); f.appendChild(v);
    var b = el("b"); txt(b, value); v.appendChild(b);
    v.insertAdjacentHTML("beforeend",
      '<svg class="__afChev" width="9" height="9" viewBox="0 0 12 12" fill="none" ' +
      'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
      'stroke-linejoin="round"><path d="M3 4.5 6 7.5 9 4.5"/></svg>');
    f.setAttribute("aria-haspopup", "listbox");
    f.setAttribute("aria-label", label + ": " + value);
    press(f, function (ev) { openDrop(f, opts, value, set); });
    return f;
  }

  var dropNode = null;

  function dropOpen() { return !!dropNode; }

  function closeDrop() {
    if (dropNode && dropNode.parentNode) dropNode.parentNode.removeChild(dropNode);
    dropNode = null;
    document.removeEventListener("mousedown", onDropOutside, true);
  }

  function onDropOutside(ev) {
    if (dropNode && !dropNode.contains(ev.target)) closeDrop();
  }

  function openDrop(anchor, opts, current, set) {
    closeDrop();
    var d = el("div", "__afDrop");
    opts.forEach(function (o) {
      var it = el("div", "__afDItem" + (o[0] === current ? " __afDOn" : ""));
      txt(it, o[0]);
      if (o[1]) { var s = el("span"); txt(s, o[1]); it.appendChild(s); }
      press(it, function () { closeDrop(); set(o[0]); markDirty(); renderDialog(); }, "option");
      d.appendChild(it);
    });
    document.body.appendChild(d);
    place(d, anchor);
    dropNode = d;
    setTimeout(function () { document.addEventListener("mousedown", onDropOutside, true); }, 0);
  }

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
    var ta = el("textarea", "__afTa");
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
    var pane = el("div", "__afPane __afEdit");
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
    pair.appendChild(box("Goal", "read before every rule", draft.goal,
      function (v) { draft.goal = v; }, "__afShort",
      "what this loop is for, in a sentence or two"));
    pair.appendChild(box("Stop when", "returns STOP and the loop ends", draft.stop,
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
