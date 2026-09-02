  /* ---------- Saved queues: the dialog shell ----------
     Two views live in it - the list (saved/list.js) and the editor
     (saved/edit.js) - and both redraw into the same host, so there is never a
     second overlay and Escape always means the same thing. */
  var IC_BOOK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"></path></svg>';
  var IC_BOOK_ADD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 12.5V4a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v17l6-3.4"></path><path d="M18 16v6"></path><path d="M15 19h6"></path></svg>';
  var IC_PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4.2L20 8.2 15.8 4 4 15.8V20z"></path><path d="M14.4 5.4l4.2 4.2"></path></svg>';
  var IC_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 15 12 9 18 15"></polyline></svg>';
  var IC_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

  var _sv = null;   /* the open dialog: {sh, host, list, q, flash, onKey, esc} */

  function openSavedModal(startInSave) {
    var sh = openShell({ title: "Saved queues", cls: "__qSavedBox", onKey: svKey });
    var host = el("div", "__qSavedBody");
    sh.box.appendChild(host);
    _sv = { sh: sh, host: host, list: null, q: "", flash: null, onKey: null, esc: null };
    sh.mount();
    showSavedList();
    if (startInSave && Q.length) openSaveForm();
  }

  /* Escape steps back one level - out of the name field, out of a delete
     confirm, out of the editor - and only closes the dialog from the list,
     where there is nothing left to step out of. Returning true is how the
     shared shell lets a caller claim a key (queue/modal-shell.js). */
  function svKey(ev) {
    if (ev.key === "Escape" && _sv && _sv.esc) {
      ev.preventDefault();
      ev.stopPropagation();
      var back = _sv.esc;
      _sv.esc = null;
      back();
      return true;
    }
    if (_sv && _sv.onKey) _sv.onKey(ev);
  }

  /* Both views start from a clean host, a clean foot and no claimed keys. */
  function svClear(title) {
    _sv.host.innerHTML = "";
    _sv.sh.foot.innerHTML = "";
    _sv.sh.title.textContent = title;
    _sv.onKey = null;
    _sv.esc = null;
  }

  /* The panel header's door: same dialog, opened straight into naming. */
  function buildSavedHeadButton() {
    var b = btn("__qMin __qHeadSave", "Save or load a queue");
    b.innerHTML = IC_BOOK_ADD;
    b.addEventListener("click", function () { openSavedModal(true); });
    return b;
  }
