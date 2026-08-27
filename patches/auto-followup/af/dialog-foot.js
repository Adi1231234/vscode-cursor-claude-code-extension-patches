  /* ---------- Manage responders: saving, deleting, and the ledger controls ----------
     Save writes through the host, so what lands is an ordinary markdown file that
     git, another editor and a hand edit all see the same way. */
  function saveDraft() {
    if (!draft) return;
    if (!String(draft.id || "").trim()) return;
    send({ type: "__ccaf", op: "save", responder: draft });
    dirty = false;
    draft.isNew = false;
    /* An armed responder that was just edited must pick up its new fields, not
       keep running on what was loaded when it was armed. */
    if (armed === draft.id) meta = JSON.parse(JSON.stringify(draft));
    renderAll();
    setTimeout(requestList, 60);
    renderDialog();
  }

  function deleteDraft() {
    if (!draft || draft.isNew) { closeDialog(); return; }
    var id = draft.id;
    send({ type: "__ccaf", op: "delete", id: id });
    if (armed === id) disarm("the responder was deleted");
    setTimeout(requestList, 60);
    closeDialog();
  }

  /* The ledger belongs to the conversation and not to the arming, so turning a
     responder off does not wipe it - what Claude asserted stays true across an
     off and on again. That makes clearing it an explicit act, which is what these
     two are. */
  function footer() {
    var f = el("div", "__afFoot");
    var count = readClaims().length;
    var ex = el("span", "__afLink" + (count ? "" : " __afMuted"));
    txt(ex, count ? "Export claims (" + count + ")" : "No claims yet");
    if (count) on(ex, "click", exportClaims);
    f.appendChild(ex);
    if (count) {
      var cl = el("span", "__afLink");
      txt(cl, "Clear");
      on(cl, "click", function () {
        if (confirm("Clear the " + count + " claims recorded for this conversation?")) {
          clearClaims();
          renderDialog();
        }
      });
      f.appendChild(cl);
    }
    f.appendChild(el("span", "__afSpacer"));
    var del = el("button", "__afB __afDel"); del.type = "button"; txt(del, "Delete");
    on(del, "click", deleteDraft);
    var cancel = el("button", "__afB __afGhost"); cancel.type = "button"; txt(cancel, "Cancel");
    on(cancel, "click", closeDialog);
    var save = el("button", "__afB __afPri"); save.type = "button"; txt(save, "Save");
    on(save, "click", saveDraft);
    f.appendChild(del); f.appendChild(cancel); f.appendChild(save);
    return f;
  }

