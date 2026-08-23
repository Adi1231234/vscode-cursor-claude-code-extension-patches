
  /* ---------- One log entry ----------
     A tool call collapses to its name plus a one-line argument; its result is
     folded into the same block when it arrives, so the feed stays scannable. */

  var SUMMARY_KEYS = ["command", "file_path", "pattern", "query", "url", "description", "prompt", "path"];

  function inputSummary(input) {
    if (input === undefined || input === null) return "";
    if (typeof input !== "object") return oneLine(input, 110);
    for (var i = 0; i < SUMMARY_KEYS.length; i++) {
      var v = input[SUMMARY_KEYS[i]];
      if (typeof v === "string" && v) return oneLine(v, 110);
    }
    try { return oneLine(JSON.stringify(input), 110); } catch (e) { return ""; }
  }

  function pretty(v) {
    if (typeof v === "string") return v;
    try { return JSON.stringify(v, null, 2); } catch (e) { return String(v); }
  }

  function foldBody(host, text, cls) {
    var pre = el("pre", "__bgEntryBody" + (cls ? " " + cls : ""));
    pre.textContent = text;
    host.appendChild(pre);
    return pre;
  }

  function entryEl(entry) {
    if (entry.k === "text" || entry.k === "thinking") {
      return el("div", "__bgEntry __bgTextEntry" + (entry.k === "thinking" ? " __bgThink" : ""), entry.text);
    }
    if (entry.k === "result") {
      var host = entry.forId ? toolEls[entry.forId] : null;
      if (host && !host.isConnected) { delete toolEls[entry.forId]; host = null; }
      if (host) {
        host.classList.add(entry.err ? "__bgToolErr" : "__bgToolOk");
        foldBody(host, entry.text || "(no output)", "__bgResBody");
        return document.createComment("folded");
      }
      var stray = el("div", "__bgEntry __bgToolEntry");
      stray.appendChild(el("div", "__bgEntryHead", entry.err ? "result (error)" : "result"));
      foldBody(stray, entry.text || "");
      wireFold(stray);
      return stray;
    }
    var box = el("div", "__bgEntry __bgToolEntry");
    var head = el("div", "__bgEntryHead");
    head.appendChild(el("span", "__bgToolName", entry.name || "tool"));
    var arg = inputSummary(entry.input);
    if (arg) head.appendChild(el("span", "__bgToolArg", arg));
    box.appendChild(head);
    foldBody(box, pretty(entry.input));
    wireFold(box);
    if (entry.id) toolEls[entry.id] = box;
    return box;
  }

  function wireFold(box) {
    var head = box.querySelector(".__bgEntryHead");
    if (!head) return;
    head.addEventListener("click", function () { box.classList.toggle("__bgOpen"); });
  }
