  /* ---------- Saved queues: the list view ----------
     The list is the frequent job, so it owns the top of the dialog. Naming and
     saving is one footer button that reveals a field (saved/save-form.js)
     rather than a form sitting permanently above the list - which put a
     DISABLED control in the first position at exactly the moment you came to
     load something. */
  var FILTER_FROM = 6;   /* a filter earns its row only once scanning stops being instant */

  function showSavedList() {
    svClear("Saved queues");
    _sv.onKey = listKey;
    if (savedRead().length >= FILTER_FROM) _sv.host.appendChild(buildFilter());
    _sv.list = el("div");
    _sv.host.appendChild(_sv.list);
    drawSavedList();
    buildListFoot();
    focusList();
  }

  /* Only the list is rebuilt as you type, so the filter keeps its focus. */
  function drawSavedList() {
    var all = savedRead();
    var q = _sv.q.trim().toLowerCase();
    var shown = q ? all.filter(function (e) { return matchesQuery(e, q); }) : all;
    _sv.list.innerHTML = "";
    if (!all.length) return _sv.list.appendChild(buildEmpty());
    if (!shown.length) return _sv.list.appendChild(buildNoMatch());
    var wrap = el("div", "__qSavedList __ccScroll");
    shown.forEach(function (en) { wrap.appendChild(buildSavedRow(en)); });
    _sv.list.appendChild(wrap);
    flashSaved();
  }

  function matchesQuery(en, q) {
    if ((en.name || "").toLowerCase().indexOf(q) >= 0) return true;
    return (en.items || []).some(function (o) { return (o.t || "").toLowerCase().indexOf(q) >= 0; });
  }

  /* A queue that was just saved gets a moment of colour and the focus, so the
     save has a visible result rather than a silently longer list. */
  function flashSaved() {
    if (!_sv.flash) return;
    var row = _sv.list.querySelector('[data-sq="' + _sv.flash + '"]');
    _sv.flash = null;
    if (!row) return;
    row.classList.add("__qJustSaved");
    try { row.querySelector(".__qSavedLoad").focus(); } catch (e) {}
  }

  function buildFilter() {
    var f = el("input", "__qFilter");
    f.type = "text";
    f.placeholder = "Filter saved queues";
    f.value = _sv.q;
    f.setAttribute("aria-label", "Filter saved queues");
    f.addEventListener("input", function () { _sv.q = f.value; drawSavedList(); });
    f.addEventListener("keydown", function (ev) { ev.stopPropagation(); });
    return f;
  }

  /* Up and down walk the rows and Enter loads the focused one (it is a button,
     so that is free) - the keys the app's own command menu answers to. */
  function listKey(ev) {
    if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
    var rows = [].slice.call(_sv.host.querySelectorAll(".__qSavedLoad"));
    if (!rows.length) return;
    ev.preventDefault();
    var i = rows.indexOf(document.activeElement), down = ev.key === "ArrowDown";
    var n = i < 0 ? (down ? 0 : rows.length - 1) : (i + (down ? 1 : rows.length - 1)) % rows.length;
    try { rows[n].focus(); } catch (e) {}
  }

  /* Save is an action and sits at the leading edge; Close is a dismissal and
     sits where a dismissal goes.

     Its weight tracks whether it is the only thing to do: with saved queues on
     screen the primary action is a ROW, and an orange button beside the list
     pulls the eye off the content it came for; with nothing saved yet, this is
     the only action in the dialog and it should look like it. */
  function buildListFoot() {
    var lone = !savedRead().length;
    var save = btn((lone ? "__qBtnPrimary" : "__qBtnGhost") + " __qFootStart");
    save.textContent = "Save current queue";
    if (Q.length) save.title = countLabel(Q.length) + " in the queue now";
    else { save.disabled = true; save.title = "Queue some messages first"; }
    save.addEventListener("click", openSaveForm);
    var close = btn("__qBtnGhost");
    close.textContent = "Close";
    close.addEventListener("click", _sv.sh.close);
    _sv.sh.foot.appendChild(save);
    _sv.sh.foot.appendChild(close);
  }

  function focusList() {
    var first = _sv.host.querySelector(".__qFilter") || _sv.host.querySelector(".__qSavedLoad");
    if (first) setTimeout(function () { try { first.focus(); } catch (e) {} }, 0);
  }

  /* Headline, one sentence, and the action itself right below in the foot. */
  function buildEmpty() {
    var d = el("div", "__qEmpty");
    var ic = el("span");
    ic.innerHTML = IC_BOOK;
    var t = el("div", "__qEmptyTitle");
    t.textContent = "No saved queues yet";
    var b = el("div", "__qEmptyBody");
    b.textContent = Q.length
      ? "Save the " + countLabel(Q.length) + " you have queued now, and they are one click away in every chat."
      : "Queue a few messages in the composer, then save them here to reuse them in any chat.";
    d.appendChild(ic);
    d.appendChild(t);
    d.appendChild(b);
    return d;
  }

  function buildNoMatch() {
    var d = el("div", "__qEmpty");
    var b = el("div", "__qEmptyBody");
    b.textContent = "Nothing matches “" + _sv.q.trim() + "”.";
    d.appendChild(b);
    return d;
  }
