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

  /* The one thing in this dialog that cannot be undone: the file is unlinked,
     there is no trash and no second copy. It was also the only destructive
     action here that asked nothing - switching responder and turning the loop
     off both go through askConfirm, and both lose a count and nothing else.
     Clearing the claims, which can be rebuilt, asks too. A responder written
     over a day went to one click before this said anything. */
  function deleteDraft() {
    if (!draft || draft.isNew) { closeDialog(); return; }
    var id = draft.id;
    askConfirm("Delete " + (draft.name || id) + "?",
      "The file is removed from the responders folder. This cannot be undone.",
      "Delete", function () { doDelete(id); });
  }

  function doDelete(id) {
    send({ type: "__ccaf", op: "delete", id: id });
    if (armed === id) disarm("the responder was deleted");
    setTimeout(requestList, 60);
    closeDialog();
  }

  /* The ledger belongs to the conversation and not to the arming, so turning a
     responder off does not wipe it - what Claude asserted stays true across an
     off and on again. That makes clearing it an explicit act, which is what these
     two are. */
  /* When this responder last changed on disk, so a save can be seen to have
     landed and an edit made somewhere else can be seen at all. Read from the
     list, which the host rebuilds from the folder after every save, rather than
     from the draft - the draft is what is on screen, and the question here is
     what is in the file.

     A time on its own for today, because that is nearly always the answer and a
     date in front of it is noise; the date as well when it is not. */
  function savedAtText() {
    var r = draft && findResponder(draft.id);
    if (!r || typeof r.updated !== "number") return draft && draft.isNew ? "not saved yet" : "";
    var d = new Date(r.updated), now = new Date();
    var hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    var sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
                  && d.getDate() === now.getDate();
    return "saved " + (sameDay ? hm
      : d.toLocaleDateString([], { day: "numeric", month: "short" }) + " " + hm);
  }

  /* Patched in place rather than by redrawing the pane: a list arrives whenever
     anything touches the folder, and rebuilding the form under someone who has
     clicked into a box would take their cursor with it. */
  function refreshSavedAt() {
    var n = document.querySelector(".__afSavedAt");
    if (n) txt(n, savedAtText());
  }

  function footer() {
    var f = el("div", "__afFoot");
    var when = el("span", "__afSavedAt");
    txt(when, savedAtText());
    f.appendChild(when);
    /* Beside the time it refreshes, because the two are one question. */
    var again = el("span", "__afLink __afRefresh");
    txt(again, "Refresh");
    on(again, "click", askRefresh);
    f.appendChild(again);
    f.appendChild(el("span", "__afRefreshSaid"));
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
    /* Save says whether there is anything to save. It looked identical whether
       the draft had been touched or not, so the only way to find out was to
       press it - and on an untouched draft that is a write nobody asked for. */
    /* Save says whether there is anything to save. It looked identical whether
       the draft had been touched or not, so the only way to find out was to
       press it - and on an untouched draft that is a write nobody asked for.
       The dot is drawn by CSS rather than added as a node, so the label stays a
       plain string that a test can read. */
    var live = dirty || (draft && draft.isNew);
    var save = el("button", "__afB __afPri" + (live ? " __afDirty" : " __afClean"));
    save.type = "button";
    txt(save, live ? "Save" : "Saved");
    on(save, "click", saveDraft);
    f.appendChild(del); f.appendChild(cancel); f.appendChild(save);
    return f;
  }

