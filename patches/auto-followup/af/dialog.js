  /* ---------- Manage responders: the shell ----------
     Two panes, the same shape background-tasks uses for its log dialog: the list
     on one side, the selected one's fields and prompt beside it. Editing happens
     here rather than in an editor tab because the files sit in ~/.claude, outside
     whatever project is open - a tab from another folder in the tab bar is a cost
     paid on every small edit, and most edits are one line.

     Save writes the file through the host, so git, history and any other editor
     see an ordinary markdown file. */
  var dlg = null, draft = null, dirty = false;

  function closeDialog() {
    /* The dropdown is appended to the body, not to the dialog, so removing the
       dialog leaves it behind - a menu floating over the panel with nothing
       under it and no way to dismiss it but clicking somewhere. */
    closeDrop();
    if (dlg && dlg.parentNode) dlg.parentNode.removeChild(dlg);
    dlg = null; draft = null; dirty = false;
    document.removeEventListener("keydown", onDialogKey, true);
  }

  /* Escape takes the innermost layer, which is the one the person is looking at.
     It used to take the dialog from under an open dropdown and discard the edits
     with it, which is a lot to lose for a keypress that meant "close this menu". */
  function onDialogKey(ev) {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    ev.stopPropagation();
    if (dropOpen()) { closeDrop(); return; }
    closeDialog();
  }

  function openDialog() {
    requestList();
    if (dlg) closeDialog();
    dlg = el("div", "__afOverlay");
    on(dlg, "mousedown", function (ev) { if (ev.target === dlg) closeDialog(); });
    document.body.appendChild(dlg);
    document.addEventListener("keydown", onDialogKey, true);
    selectDraft(armed || (list[0] && list[0].id) || null);
  }

  /* A responder that has never been saved is a draft with a new id; the list pane
     shows it in place so it is obvious what is being written. */
  function newDraft() {
    var n = 1, id = "responder";
    while (findResponder(id)) { n += 1; id = "responder-" + n; }
    return {
      id: id, name: id, description: "", context: "last-message+claims",
      max_turns: "20", autosend: "false", model: "sonnet",
      rules: "", stop: "", extra: {}, isNew: true
    };
  }

  function selectDraft(id) {
    var r = id ? findResponder(id) : null;
    draft = r ? JSON.parse(JSON.stringify(r)) : newDraft();
    dirty = false;
    renderDialog();
  }

  function listPane() {
    var pane = el("div", "__afPane __afList");
    list.forEach(function (r) {
      var it = el("div", "__afLItem" + (draft && draft.id === r.id ? " __afSel" : ""));
      var dot = el("span", "__afDot" + (armed === r.id ? "" : " __afDotOff"));
      var t = el("span", "__afT");
    t.dir = "auto";
      var nm = el("b"); txt(nm, r.name || r.id); t.appendChild(nm);
      if (r.description) { var d = el("span"); txt(d, r.description); t.appendChild(d); }
      it.appendChild(dot); it.appendChild(t);
      press(it, function () {
        if (dirty && !confirm("Discard the unsaved changes?")) return;
        selectDraft(r.id);
      });
      pane.appendChild(it);
    });
    if (draft && draft.isNew) {
      var mine = el("div", "__afLItem __afSel");
      var t2 = el("span", "__afT"); var b2 = el("b");
      txt(b2, draft.name || draft.id); t2.appendChild(b2);
      mine.appendChild(el("span", "__afDot __afDotOff")); mine.appendChild(t2);
      pane.appendChild(mine);
    }
    var add = el("div", "__afNew");
    txt(add, "+ New responder");
    press(add, function () {
      if (dirty && !confirm("Discard the unsaved changes?")) return;
      selectDraft(null);
    });
    pane.appendChild(add);
    return pane;
  }

  function renderDialog() {
    if (!dlg) return;
    dlg.innerHTML = "";
    var box = el("div", "__afDlg");
    var head = el("div", "__afDlgHead");
    var h = el("h3"); txt(h, "Responders"); head.appendChild(h);
    var x = el("span", "__afX"); txt(x, "✕");
    x.setAttribute("aria-label", "Close");
    press(x, closeDialog);
    head.appendChild(x);
    box.appendChild(head);

    var body = el("div", "__afDlgBody");
    body.appendChild(editPane());
    body.appendChild(listPane());
    box.appendChild(body);
    box.appendChild(footer());
    dlg.appendChild(box);
  }
