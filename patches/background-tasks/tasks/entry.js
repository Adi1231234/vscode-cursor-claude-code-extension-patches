
  /* ---------- One log entry ----------
     A tool call collapses to its name plus a one-line argument, with a timestamp
     gutter so the feed reads like a log rather than a transcript. Its result folds
     into the same block when it arrives, and the outcome shows on the block's
     leading edge - with a caret that changes too, so it is never colour alone. */

  var SUMMARY_KEYS = ["command", "file_path", "pattern", "query", "url", "description", "prompt", "path"];

  function inputSummary(input) {
    if (input === undefined || input === null) return "";
    if (typeof input !== "object") return oneLine(input, 140);
    for (var i = 0; i < SUMMARY_KEYS.length; i++) {
      var v = input[SUMMARY_KEYS[i]];
      if (typeof v === "string" && v) return oneLine(v, 140);
    }
    try { return oneLine(JSON.stringify(input), 140); } catch (e) { return ""; }
  }

  function pretty(v) {
    if (typeof v === "string") return v;
    try { return JSON.stringify(v, null, 2); } catch (e) { return String(v); }
  }

  function stampEl(entry) {
    var s = el("span", "__bgAt", entry.at ? clock(entry.at) : "");
    s.setAttribute("aria-hidden", "true");
    return s;
  }

  function foldBody(host, text, cls) {
    var pre = el("pre", "__bgEntryBody __ccScroll" + (cls ? " " + cls : ""));
    pre.textContent = text;
    host.appendChild(pre);
    return pre;
  }

  function entryEl(entry) {
    if (entry.k === "text" || entry.k === "thinking") {
      var t = el("div", "__bgEntry __bgTextEntry" + (entry.k === "thinking" ? " __bgThink" : ""));
      t.appendChild(stampEl(entry));
      t.appendChild(el("span", "__bgTextBody", entry.text));
      return t;
    }
    if (entry.k === "result") {
      var host = entry.forId ? toolEls[entry.forId] : null;
      if (host && !host.isConnected) { delete toolEls[entry.forId]; host = null; }
      if (host) {
        host.classList.add(entry.err ? "__bgToolErr" : "__bgToolOk");
        foldBody(host, entry.text || "(no output)", "__bgResBody");
        return document.createComment("folded");
      }
      var stray = toolBox(entry.err ? "result (error)" : "result", "", entry);
      foldBody(stray, entry.text || "");
      return stray;
    }
    var box = toolBox(entry.name || "tool", inputSummary(entry.input), entry);
    foldBody(box, pretty(entry.input));
    if (entry.id) toolEls[entry.id] = box;
    return box;
  }

  function toolBox(name, arg, entry) {
    var box = el("div", "__bgEntry __bgToolEntry");
    var head = el("div", "__bgEntryHead");
    head.setAttribute("role", "button");
    head.tabIndex = 0;
    head.setAttribute("aria-expanded", "false");
    head.appendChild(stampEl(entry));
    head.appendChild(el("span", "__bgCaret", "\u203a"));
    head.appendChild(el("span", "__bgToolName", name));
    if (arg) head.appendChild(el("span", "__bgToolArg", arg));
    box.appendChild(head);
    var toggle = function () {
      var open = box.classList.toggle("__bgOpen");
      head.setAttribute("aria-expanded", open ? "true" : "false");
    };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(); }
    });
    return box;
  }
