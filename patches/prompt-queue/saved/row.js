  /* ---------- Saved queues: one row of the list ----------
     The row IS the load button, in the shape of the app's own command-menu
     item: the name on one line and what is inside on the next, because
     choosing between two saved queues from their names alone means
     remembering what you put in them. The two management controls sit at the
     trailing edge, always present rather than on hover - a control that
     appears on hover does not exist for the keyboard. */
  function buildSavedRow(en) {
    var row = el("div", "__qSavedItem");
    row.setAttribute("data-sq", en.id);
    var n = (en.items || []).length, name = en.name || "Untitled", preview = savedPreview(en);
    var load = btn("__qSavedLoad", "Add these messages to the queue");
    var nm = el("span", "__qSavedName");
    nm.textContent = name;
    var meta = el("span", "__qSavedMeta");
    meta.textContent = preview;
    var count = el("span", "__qCount");
    count.textContent = n;
    /* The chip reads as a bare number, so the whole row gets one spoken name
       instead - the label wins over the content for assistive tech. */
    load.setAttribute("aria-label", name + ", " + countLabel(n) + ", " + preview);
    load.appendChild(nm);
    load.appendChild(meta);
    load.appendChild(count);
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

  /* Confirm rather than undo: this is infrequent, and it is not reversible -
     the prompts are gone. So it follows the confirmation rules rather than the
     undo ones: it names the queue, states what goes with it, labels the button
     with the verb rather than "OK", and leaves the focus on Cancel so a stray
     Enter cannot delete. It happens IN PLACE OF THE ROW instead of in a second
     dialog: one shell is open at a time by design, and stacked modals are the
     thing every guideline tells you not to build. */
  function askDeleteSaved(row, en) {
    row.innerHTML = "";
    row.classList.add("__qConfirm");
    var q = el("span", "__qConfirmText");
    var nm = en.name || "Untitled";
    if (nm.length > 40) nm = nm.slice(0, 40).trim() + "...";   /* the sentence stays two lines at most */
    q.textContent = "Delete “" + nm + "”? Its " + countLabel((en.items || []).length) + " go with it.";
    var no = btn("__qBtnGhost __qMini");
    no.textContent = "Cancel";
    no.addEventListener("click", function () { showSavedList(); });
    var yes = btn("__qBtnDanger __qMini");
    yes.textContent = "Delete";
    yes.addEventListener("click", function () { savedDrop(en.id); showSavedList(); });
    /* The pair wraps as one: at a narrow panel the sentence takes two lines and
       a lone Delete underneath a Cancel reads like two separate choices. */
    var acts = el("span", "__qConfirmActs");
    acts.appendChild(no);
    acts.appendChild(yes);
    row.appendChild(q);
    row.appendChild(acts);
    _sv.esc = function () { showSavedList(); };
    try { no.focus(); } catch (e) {}
  }
