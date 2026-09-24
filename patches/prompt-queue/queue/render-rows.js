  /* ord is the item's 1-based position in the LANE, or 0 for a floating
     scheduled one. A floating item is out of the order, so it is drawn
     without the position field and without the reorder column - there is no
     number to show and nothing for an arrow to mean. That absence is the
     point: the numbers now only ever appear on rows that really do send in
     the order they are printed. */
  function buildRow(it, ord, n) {
    var row = el("div", "__qRow" + (it.off ? " __qOff" : "") + (ord ? "" : " __qFloat"));
    var check = el("span", "__qCheck" + (it.off ? "" : " __qOn"));
    check.textContent = it.off ? "" : "\u2713";
    check.title = it.off ? "Skipped - won't be sent (click to enable)" : "Will be sent (click to skip)";
    check.addEventListener("click", function () { toggleSkip(it); });
    var num = el("input", "__qNum");
    num.type = "text";
    num.inputMode = "numeric";
    num.value = ord;
    num.title = "Position - type a number, Enter to move (Esc to cancel)";
    num.setAttribute("aria-label", "Queue position");
    var canceled = false;
    num.addEventListener("focus", function () { editing = true; num.select(); });
    num.addEventListener("input", function () {
      var digits = num.value.replace(/[^0-9]/g, "");
      if (digits !== num.value) num.value = digits;
    });
    num.addEventListener("keydown", function (ev) {
      ev.stopPropagation();
      if (ev.key === "Enter") { ev.preventDefault(); num.blur(); }
      else if (ev.key === "Escape") { ev.preventDefault(); canceled = true; num.blur(); }
    });
    num.addEventListener("blur", function () {
      editing = false;
      var cur = laneOrdinal(it);
      if (canceled) { canceled = false; num.value = cur; return; }
      var p = parseInt(num.value, 10);
      if (isNaN(p)) { num.value = cur; return; }
      if (p === cur) { num.value = cur; return; }  /* no change - skip rebuild so a following click is not swallowed */
      moveItemTo(it, p);
    });
    var text = el("div", "__qText");
    text.contentEditable = "plaintext-only";
    text.dir = "auto";
    text.textContent = it.text;
    text.addEventListener("input", function () { it.text = text.textContent; scheduleSave(); });
    text.addEventListener("keydown", function (ev) {
      ev.stopPropagation();
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); text.blur(); }
    });
    if (ord) row.appendChild(buildNav(it, ord, n));
    row.appendChild(buildRowMenu(it));
    if (it.auto) {
      var ai = el("span", "__qAi");
      ai.textContent = "✦";
      ai.title = "Written by a responder, not by you";
      ai.setAttribute("aria-label", "written by a responder");
      row.appendChild(ai);
    }
    row.appendChild(check);
    if (ord) row.appendChild(num);
    row.appendChild(text);
    if (it.files && it.files.length) row.appendChild(buildThumbs(it.files));
    row.appendChild(buildClock(it));
    return row;
  }

  /* Two groups, because the queue runs two (see schedule-order.js): the lane,
     whose printed order is the send order, and scheduled messages, which are
     committed to a clock and to nothing else. The "In order" heading appears
     only when both exist - a single group needs no name - but "Scheduled"
     always does, because rows without numbers have to say why. */
  function buildBody() {
    var body = el("div", "__qBody __ccScroll");
    if (bodyMax) body.style.maxHeight = bodyMax + "px";
    var lane = laneItems(), floating = floatItems();
    if (lane.length && floating.length) body.appendChild(buildGroup("In order", ""));
    lane.forEach(function (it, i) { body.appendChild(buildRow(it, i + 1, lane.length)); });
    if (floating.length) body.appendChild(buildGroup("Scheduled", "sent at their time, out of order"));
    floating.forEach(function (it) { body.appendChild(buildRow(it, 0, 0)); });
    return body;
  }

  function render() {
    /* A rebuild destroys any focused position input, so clear the edit flag -
       otherwise an external re-render could leave it stuck true and freeze flushing. */
    editing = false;
    closeRowMenu();   /* the popup is body-mounted: a rebuild would orphan it */
    saveQueue();
    var e = inp();
    if (!e) return;
    ensurePanel(e);
    /* Preserve the body scroll position across the full rebuild, so adding an
       item or reordering does not snap the list back to the top. */
    var prevBody = panel.querySelector(".__qBody");
    var prevScroll = prevBody ? prevBody.scrollTop : 0;
    panel.innerHTML = "";
    panel.style.display = Q.length ? "flex" : "none";
    if (!Q.length) return;
    if (!collapsed) panel.appendChild(buildResizeHandle());
    panel.appendChild(buildHeader());
    if (collapsed) return;
    var body = buildBody();
    panel.appendChild(body);
    body.scrollTop = prevScroll;
  }

