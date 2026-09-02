  /* ---------- Saving the current queue: a field, revealed ----------
     "Save current queue" in the foot reveals this row above the list with the
     suggested name selected, so the whole gesture is: click, type or accept,
     Enter. It is disclosure rather than a permanent form because the dialog is
     opened to LOAD far more often than to save, and a field you are not using
     is a field in the way of the list.

     While it is open the foot's own Save is gone: two Saves on screen, one of
     them the thing you just clicked, is the kind of small confusion that makes
     a dialog feel unfinished. */
  function openSaveForm() {
    if (!_sv || !Q.length) return;
    var existing = _sv.host.querySelector(".__qSaveForm");
    if (existing) { try { existing.querySelector(".__qNameIn").focus(); } catch (e) {} return; }

    var form = el("div", "__qSaveForm");
    var name = el("input", "__qNameIn");
    name.type = "text";
    name.placeholder = "Name this queue";
    name.value = suggestSavedName();
    name.setAttribute("aria-label", "Name for the saved queue");
    var ok = btn("__qBtnPrimary __qMini");
    ok.textContent = "Save";
    var no = btn("__qBtnGhost __qMini");
    no.textContent = "Cancel";

    function commit() {
      var nm = (name.value || "").trim() || suggestSavedName() || "Untitled";
      _sv.flash = savedAdd(nm, Q.map(savedItemOf));
      showSavedList();
    }
    ok.addEventListener("click", commit);
    no.addEventListener("click", function () { showSavedList(); });
    /* Escape backs out of the FIELD rather than the dialog (svKey, via the
       shell's claim-a-key hook); Enter commits. */
    _sv.esc = function () { showSavedList(); };
    name.addEventListener("keydown", function (ev) {
      ev.stopPropagation();
      if (ev.key === "Enter") { ev.preventDefault(); commit(); }
    });

    form.appendChild(name);
    form.appendChild(ok);
    form.appendChild(no);
    _sv.host.insertBefore(form, _sv.host.firstChild);
    /* The foot's Save goes, and says in its place exactly what is being named -
       otherwise the band is half empty and the field does not say what it is
       about to keep. */
    var footSave = _sv.sh.foot.querySelector(".__qFootStart");
    if (footSave) {
      var hint = el("span", "__qHint __qFootStart");
      hint.textContent = countLabel(Q.length) + " will be saved";
      _sv.sh.foot.replaceChild(hint, footSave);
    }
    try { name.focus(); name.select(); } catch (e) {}
  }
