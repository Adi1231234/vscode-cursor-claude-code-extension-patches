
  /* ---------- The task list ----------
     Two labelled groups with counts rather than one flat run of rows: "Running" on
     top, "Finished" under it. A row carries three levels of weight - name, then the
     live detail, then the duration - so a long list stays scannable. */

  var listSig = null;

  function row(t) {
    var r = el("div", "__bgRow" + (t.id === sel ? " __bgRowSel" : "") + (isRunning(t) ? "" : " __bgRowDone"));
    r.setAttribute("role", "option");
    r.setAttribute("aria-selected", t.id === sel ? "true" : "false");

    /* One glyph carries both facts: the task type, with its status as a badge on
       the corner. Two separate columns made every row read as noise. */
    var icon = el("span", "__bgIcon");
    icon.innerHTML = iconFor(t.type);
    icon.appendChild(el("span", "__bgDot __bgDot-" + statusWord(t)));
    icon.setAttribute("aria-hidden", "true");

    var mid = el("div", "__bgRowMid");
    mid.appendChild(el("div", "__bgRowName", oneLine(label(t), 90)));
    var d = detail(t);
    if (d) mid.appendChild(el("div", "__bgRowDetail", d));

    var side = el("div", "__bgRowSide");
    side.appendChild(el("span", "__bgRowTime", duration(t)));
    /* Status is never colour alone: the dot has a word beside it for the states
       that matter, and a screen reader gets it from the row label. */
    if (!isRunning(t) && statusWord(t) !== "done") side.appendChild(el("span", "__bgRowFlag __bgRowFlag-" + statusWord(t), statusWord(t)));

    r.appendChild(icon);
    r.appendChild(mid);
    r.appendChild(side);
    r.setAttribute("aria-label", typeWord(t) + ", " + statusWord(t) + ", " + label(t));
    r.addEventListener("click", function () { selectTask(t.id); goDetail(false); });
    return r;
  }

  function groupHead(text, n) {
    var g = el("div", "__bgGroup");
    g.appendChild(el("span", "__bgGroupName", text));
    g.appendChild(el("span", "__bgGroupCount", String(n)));
    return g;
  }

  function signature(snap) {
    var parts = [sel || "", stacked ? "s" : "w"];
    var all = snap.running.concat(snap.finished);
    for (var i = 0; i < all.length; i++) {
      var t = all[i];
      parts.push(t.id + "|" + statusWord(t) + "|" + label(t) + "|" + detail(t) + "|" + duration(t));
    }
    return parts.join(";;");
  }

  function renderList() {
    if (!listEl) return;
    var snap = snapshot();
    if (sel && !TASKS[sel]) { sel = null; resetPane(); }
    if (!sel) {
      var first = snap.running[0] || snap.finished[0];
      if (first) { sel = first.id; resetPane(); }
    }
    setText(headSub, subtitle(snap));
    var sig = signature(snap);
    if (sig === listSig) return;
    listSig = sig;
    /* Rebuilt roughly once a second (the elapsed times tick), so the scroll
       position has to be carried over or a long list keeps jumping to the top. */
    var keepScroll = listEl.scrollTop;
    clear(listEl);
    if (!snap.running.length && !snap.finished.length) {
      listEl.appendChild(emptyState("Nothing has run in the background yet.",
        "Subagents, backgrounded commands and workflows show up here while they run, and stay afterwards so you can read their logs."));
      return;
    }
    if (snap.running.length) {
      listEl.appendChild(groupHead("Running", snap.running.length));
      for (var i = 0; i < snap.running.length; i++) listEl.appendChild(row(snap.running[i]));
    }
    if (snap.finished.length) {
      listEl.appendChild(groupHead("Finished", snap.finished.length));
      for (var j = 0; j < snap.finished.length; j++) listEl.appendChild(row(snap.finished[j]));
    }
    listEl.scrollTop = keepScroll;
  }

  function subtitle(snap) {
    if (!snap.running.length && !snap.finished.length) return "nothing yet";
    var bits = [];
    if (snap.running.length) bits.push(snap.running.length + " running");
    if (snap.finished.length) bits.push(snap.finished.length + " finished");
    return bits.join(" · ");
  }

  function emptyState(title, body) {
    var e = el("div", "__bgEmpty");
    e.appendChild(el("div", "__bgEmptyTitle", title));
    if (body) e.appendChild(el("div", "__bgEmptyBody", body));
    return e;
  }

  function renderDialog() {
    if (!back) return;
    measureLayout();
    askHistory();
    renderList();
    renderPane(sel ? TASKS[sel] : null);
  }
