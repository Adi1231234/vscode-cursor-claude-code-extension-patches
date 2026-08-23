
  /* ---------- Dialog shell and task list ----------
     Two panes in normal flow, so the list lands on the leading side under both the
     rtl patch and plain LTR. Running rows on top, a separator, then finished ones. */

  var back = null;      /* backdrop element, null when closed */
  var listEl = null;
  var sel = null;       /* selected task id */

  function openDialog() {
    if (back) return;
    back = el("div", "__bgBackdrop");
    var modal = el("div", "__bgModal");
    var head = el("div", "__bgHead");
    head.appendChild(el("span", "__bgTitle", "Background tasks"));
    var close = btn("__bgClose", "Close");
    close.textContent = "✕";
    close.addEventListener("click", closeDialog);
    head.appendChild(close);
    var body = el("div", "__bgBody");
    listEl = el("div", "__bgList");
    body.appendChild(listEl);
    body.appendChild(buildPane());
    modal.appendChild(head);
    modal.appendChild(body);
    back.appendChild(modal);
    back.addEventListener("mousedown", function (ev) { if (ev.target === back) closeDialog(); });
    document.body.appendChild(back);
    document.addEventListener("keydown", onKey, true);
    renderDialog();
  }

  function closeDialog() {
    if (!back) return;
    document.removeEventListener("keydown", onKey, true);
    back.remove();
    back = null;
    listEl = null;
    listSig = null;
    forgetHistoryRequest();
    resetPane();
  }

  function onKey(ev) {
    if (ev.key === "Escape" && back) { ev.preventDefault(); ev.stopPropagation(); closeDialog(); }
  }

  /* resetPane closes whatever tail is actually open; closing by selection instead
     would send a close for a task that was never tailed - and the host keys tails by
     task id, so that can cut off another panel watching the same one. */
  function selectTask(id) {
    if (sel === id) return;
    sel = id;
    resetPane();
    renderDialog();
  }

  function row(t) {
    var r = el("div", "__bgRow" + (t.id === sel ? " __bgRowSel" : ""));
    var dot = el("span", "__bgDot __bgDot-" + statusWord(t));
    var icon = el("span", "__bgIcon");
    icon.innerHTML = iconFor(t.type);
    var mid = el("div", "__bgRowMid");
    mid.appendChild(el("div", "__bgRowName", oneLine(label(t), 80)));
    var d = detail(t);
    if (d) mid.appendChild(el("div", "__bgRowDetail", d));
    var time = el("span", "__bgRowTime", duration(t));
    r.appendChild(dot);
    r.appendChild(icon);
    r.appendChild(mid);
    r.appendChild(time);
    r.addEventListener("click", function () { selectTask(t.id); });
    return r;
  }

  /* Rebuilt only when something a row shows actually changed - the observer that
     drives this fires on every DOM mutation the app makes while streaming. */
  var listSig = null;

  function signature(snap) {
    var parts = [sel || ""];
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
    var sig = signature(snap);
    if (sig === listSig) return;
    listSig = sig;
    /* Rebuilt roughly once a second (the elapsed times tick), so the scroll
       position has to be carried over or a long list keeps jumping to the top. */
    var keepScroll = listEl.scrollTop;
    clear(listEl);
    if (!snap.running.length && !snap.finished.length) {
      listEl.appendChild(el("div", "__bgEmpty", "No background tasks in this conversation."));
      return;
    }
    for (var i = 0; i < snap.running.length; i++) listEl.appendChild(row(snap.running[i]));
    if (snap.finished.length) {
      var sep = el("div", "__bgSep");
      sep.appendChild(el("span", "__bgSepLabel", snap.finished.length === 1 ? "1 finished" : snap.finished.length + " finished"));
      listEl.appendChild(sep);
      for (var j = 0; j < snap.finished.length; j++) listEl.appendChild(row(snap.finished[j]));
    }
    listEl.scrollTop = keepScroll;
  }

  function renderDialog() {
    if (!back) return;
    askHistory();
    renderList();
    renderPane(sel ? TASKS[sel] : null);
  }
