  /* ---------- Saved queues: the dialog ----------
     Two views in one shell - the list (pick one, or save the current queue)
     and the editor (saved/edit.js). Both redraw into the same host, so there
     is never a second overlay and Esc always means the same thing. */
  var IC_BOOK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"></path></svg>';
  var IC_BOOK_ADD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 12.5V4a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v17l6-3.4"></path><path d="M18 16v6"></path><path d="M15 19h6"></path></svg>';
  var IC_PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4.2L20 8.2 15.8 4 4 15.8V20z"></path><path d="M14.4 5.4l4.2 4.2"></path></svg>';

  var _sv = null;   /* the open dialog: {sh, host} */

  function openSavedModal(focusSave) {
    var sh = openShell({ title: "Saved queues", cls: "__qSavedBox" });
    var host = el("div", "__qSavedBody");
    sh.box.appendChild(host);
    _sv = { sh: sh, host: host };
    sh.mount();
    showSavedList(!!focusSave);
  }

  /* Both views start from a clean host and a clean foot. */
  function svClear(title) {
    _sv.host.innerHTML = "";
    _sv.sh.foot.innerHTML = "";
    _sv.sh.title.textContent = title;
  }

  function showSavedList(focusSave) {
    svClear("Saved queues");
    _sv.host.appendChild(buildSaveRow(focusSave));
    var list = savedRead();
    _sv.host.appendChild(list.length ? buildSavedList(list) : savedEmpty());
    var close = btn("__qBtnGhost");
    close.textContent = "Close";
    close.addEventListener("click", _sv.sh.close);
    _sv.sh.foot.appendChild(close);
  }

  function savedEmpty() {
    var d = el("div", "__qEmpty");
    d.textContent = "Nothing saved yet. Build a queue in the composer, then save it here and it is one click away in every chat.";
    return d;
  }

  function buildSavedList(list) {
    var wrap = el("div", "__qSavedList __ccScroll");
    list.forEach(function (en) { wrap.appendChild(buildSavedRow(en)); });
    return wrap;
  }

  /* Save the current queue. Disabled with the reason in place of the field's
     placeholder when there is nothing to save, rather than a button that looks
     live and does nothing - the same stance the row menu takes. */
  function buildSaveRow(focusNow) {
    var row = el("div", "__qSaveRow");
    var name = el("input", "__qNameIn");
    name.type = "text";
    name.setAttribute("aria-label", "Name for the saved queue");
    var b = btn("__qBtnPrimary");
    b.textContent = "Save current queue";
    if (Q.length) {
      name.placeholder = "Name this queue";
      name.value = suggestSavedName();
    } else {
      name.placeholder = "The queue is empty";
      name.disabled = true;
      b.disabled = true;
      b.title = "Add messages to the queue first";
    }
    function save() {
      if (!Q.length) return;
      savedAdd((name.value || "").trim() || suggestSavedName() || "Untitled", Q.map(savedItemOf));
      showSavedList(false);
    }
    b.addEventListener("click", save);
    name.addEventListener("keydown", function (ev) {
      ev.stopPropagation();
      if (ev.key === "Enter") { ev.preventDefault(); save(); }
    });
    row.appendChild(name);
    row.appendChild(b);
    var hint = el("div", "__qHint __qSaveHint");
    hint.textContent = Q.length
      ? countLabel(Q.length) + " in the queue now - text, skipped state and relative timers are kept; attachments are not."
      : "Queue some messages first, then come back to save them.";
    row.appendChild(hint);
    if (focusNow && Q.length) setTimeout(function () { try { name.focus(); name.select(); } catch (e) {} }, 0);
    return row;
  }

  /* The two doors into this dialog: a quiet button beside the composer's send
     button (the only one reachable while the queue is empty, i.e. exactly when
     you want to load one) and the bookmark in the queue panel's own header. */
  function buildSavedHeadButton() {
    var b = btn("__qMin __qHeadSave", "Save or load a queue");
    b.innerHTML = IC_BOOK_ADD;
    b.addEventListener("click", function () { openSavedModal(true); });
    return b;
  }
