  /* ---------- Saved queues: the editor ----------
     Works on a DRAFT copy (queueItemOf, i.e. the same shape a loaded item has,
     so savedItemOf serializes it back with no second conversion). Nothing is
     written until Save, which is what makes Cancel - and Escape, which steps
     back to the list - a real cancel. */
  function showSavedEdit(en) {
    var draft = (en.items || []).map(queueItemOf);
    var name = en.name || "";
    svClear("Edit saved queue", "", IC_PEN);
    _sv.esc = function () { showSavedList(); };

    function draw() {
      /* The count belongs in the header's subtitle, not as a line of its own
         above the list: it describes the whole view. */
      _sv.sh.sub.textContent = draft.length ? countLabel(draft.length) + ", sent in this order" : "No messages yet";
      _sv.host.innerHTML = "";
      var ni = el("input", "__qNameIn");
      ni.type = "text";
      ni.value = name;
      ni.placeholder = "Name this queue";
      ni.setAttribute("aria-label", "Name for the saved queue");
      ni.addEventListener("input", function () { name = ni.value; });
      ni.addEventListener("keydown", function (ev) { ev.stopPropagation(); if (ev.key === "Enter") ev.preventDefault(); });
      _sv.host.appendChild(ni);

      var list = el("div", "__qEditList __ccScroll");
      if (draft.length) draft.forEach(function (it, i) { list.appendChild(buildEditRow(it, i, draft, draw)); });
      else {
        var e0 = el("div", "__qEmptyBody");
        e0.textContent = "No messages in this queue yet.";
        list.appendChild(e0);
      }
      _sv.host.appendChild(list);

      var add = btn("__qBtnGhost __qMini __qAddMsg");
      add.textContent = "+ Add message";
      add.addEventListener("click", function () {
        draft.push(queueItemOf({ t: "" }));
        draw();
        var rows = _sv.host.querySelectorAll(".__qEditText");
        if (rows.length) try { rows[rows.length - 1].focus(); } catch (e) {}
      });
      _sv.host.appendChild(add);
    }

    draw();
    var back = btn("__qBtnQuiet");
    back.textContent = "Cancel";
    back.addEventListener("click", function () { showSavedList(); });
    var save = btn("__qBtnPrimary");
    save.textContent = "Save changes";
    save.addEventListener("click", function () {
      /* A blank line is a row the user emptied or added and left. Dropping it
         on save is the only reading that does not put an unsendable item in a
         future queue: flush() silently drops a blank item, and a message that
         vanishes later is worse than one that never saved. */
      var keep = draft.filter(function (it) { return (it.text || "").trim(); });
      savedPut(en.id, (name || "").trim() || "Untitled", keep.map(savedItemOf));
      showSavedList();
    });
    _sv.sh.foot.appendChild(back);
    _sv.sh.foot.appendChild(save);
  }

  function buildEditRow(it, i, draft, draw) {
    var row = el("div", "__qEditRow" + (it.off ? " __qOff" : ""));
    var nav = el("span", "__qEditNav");
    nav.appendChild(navIcon(IC_UP, "Move up", i === 0, function () { swapAt(draft, i, i - 1); draw(); }));
    nav.appendChild(navIcon(IC_DOWN, "Move down", i === draft.length - 1, function () { swapAt(draft, i, i + 1); draw(); }));

    /* The 15px box the queue rows use, inside a 24px hit area (WCAG 2.5.8). */
    var hit = el("span", "__qCheckHit");
    var check = el("span", "__qCheck" + (it.off ? "" : " __qOn"));
    check.textContent = it.off ? "" : "✓";
    hit.title = it.off ? "Loaded skipped - won't be sent (click to enable)" : "Loaded ready to send (click to skip)";
    hit.appendChild(check);
    hit.addEventListener("click", function () { it.off = !it.off; draw(); });

    var text = el("div", "__qEditText");
    text.contentEditable = "plaintext-only";
    text.dir = "auto";
    text.textContent = it.text;
    text.addEventListener("input", function () { it.text = text.textContent; });
    text.addEventListener("keydown", function (ev) { ev.stopPropagation(); });

    row.appendChild(nav);
    row.appendChild(hit);
    row.appendChild(text);
    if (isScheduled(it)) row.appendChild(buildSchedTag(it, draw));
    row.appendChild(iconBtn(IC_TRASH, "Remove message", "__qMenuDanger", function () { draft.splice(i, 1); draw(); }));
    return row;
  }

  function navIcon(icon, title, disabled, fn) {
    var b = iconBtn(icon, title, "", fn);
    b.disabled = disabled;
    return b;
  }

  /* A saved schedule is relative by construction (store.js drops at-times), so
     all there is to show is its kind and its length - and the one edit that
     makes sense here is dropping it. Setting one is done on the live queue row,
     where the whole schedule modal is, and saved from there. */
  function buildSchedTag(it, draw) {
    var mins = Math.max(1, Math.round((it.dur || 0) / 60000));
    var tag = btn("__qSchedTag", (it.mode === "after" ? "Sends " + labelMins(mins) + " after the message before it" : "A " + labelMins(mins) + " timer, restarted by hand when loaded") + " - click to clear");
    tag.textContent = (it.mode === "after" ? "after " : "timer ") + labelMins(mins);
    tag.addEventListener("click", function () {
      it.mode = "queue";
      it.dur = null;
      it.rearm = false;
      draw();
    });
    return tag;
  }
