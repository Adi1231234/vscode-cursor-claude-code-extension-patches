  /* ---------- Saved queues: one row of the list ----------
     The name IS the load button - the thing you came for is the whole target,
     and the two small controls beside it (edit / delete) are the management
     the row also has to carry. */
  function buildSavedRow(en) {
    var row = el("div", "__qSavedItem");
    var load = btn("__qSavedLoad", "Add these messages to the queue");
    var nm = el("span", "__qSavedName");
    nm.textContent = en.name || "Untitled";
    var meta = el("span", "__qSavedMeta");
    meta.textContent = countLabel((en.items || []).length);
    load.appendChild(nm);
    load.appendChild(meta);
    load.addEventListener("click", function () {
      loadSavedInto(en);
      _sv.sh.close();      /* the queue panel behind is the confirmation */
    });

    var acts = el("span", "__qSavedActs");
    acts.appendChild(iconBtn(IC_PEN, "Edit", "", function () { showSavedEdit(en); }));
    acts.appendChild(iconBtn(IC_TRASH, "Delete", "__qMenuDanger", function () { askDeleteSaved(row, en); }));
    row.appendChild(load);
    row.appendChild(acts);
    return row;
  }

  /* Confirm in place of the row, not in a second dialog: one shell is open at
     a time by design, and a modal over a modal is more ceremony than one row
     deserves. Cancel takes the focus, so Enter never deletes. Either answer
     redraws the list, which is also how the row gets its contents back. */
  function askDeleteSaved(row, en) {
    row.innerHTML = "";
    row.classList.add("__qConfirm");
    var q = el("span", "__qSavedName");
    q.textContent = "Delete " + (en.name || "Untitled") + "?";
    var no = btn("__qBtnGhost __qMini");
    no.textContent = "Cancel";
    no.addEventListener("click", function () { showSavedList(false); });
    var yes = btn("__qBtnDanger __qMini");
    yes.textContent = "Delete";
    yes.addEventListener("click", function () { savedDrop(en.id); showSavedList(false); });
    row.appendChild(q);
    row.appendChild(no);
    row.appendChild(yes);
    try { no.focus(); } catch (e) {}
  }
