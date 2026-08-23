
  /* ---------- Splitter and keyboard ----------
     A list-detail view is expected to be drivable from the keyboard alone, and
     the list width is the user's to set. */

  /* ---------- Splitter ---------- */
  function buildSplitter() {
    var s = el("div", "__bgSplit");
    s.setAttribute("role", "separator");
    s.setAttribute("aria-label", "Resize task list");
    s.addEventListener("pointerdown", function (ev) {
      ev.preventDefault();
      s.setPointerCapture(ev.pointerId);
      var startX = ev.clientX, startW = listEl.getBoundingClientRect().width;
      var rtl = getComputedStyle(bodyEl).direction === "rtl";
      var move = function (e) {
        var d = (e.clientX - startX) * (rtl ? -1 : 1);
        listEl.style.width = Math.max(180, Math.min(460, startW + d)) + "px";
      };
      var up = function () {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
    return s;
  }

  /* ---------- Keyboard ---------- */
  function onKey(ev) {
    if (!back) return;
    if (ev.key === "Escape") {
      ev.preventDefault(); ev.stopPropagation();
      if (stacked && showDetail) goList(); else closeDialog();
      return;
    }
    if (ev.key === "Tab") trapFocus(ev);
  }

  function trapFocus(ev) {
    var f = modalEl.querySelectorAll('button, input, [tabindex="0"]');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }

  function onListKey(ev) {
    var snap = snapshot();
    var ids = snap.running.concat(snap.finished).map(function (t) { return t.id; });
    if (!ids.length) return;
    var i = ids.indexOf(sel);
    if (ev.key === "ArrowDown") { ev.preventDefault(); selectTask(ids[Math.min(ids.length - 1, i + 1)]); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); selectTask(ids[Math.max(0, i - 1)]); }
    else if (ev.key === "Home") { ev.preventDefault(); selectTask(ids[0]); }
    else if (ev.key === "End") { ev.preventDefault(); selectTask(ids[ids.length - 1]); }
    else if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); goDetail(true); }
  }

  function selectTask(id) {
    if (sel === id) return;
    sel = id;
    resetPane();
    renderDialog();
    var row = listEl && listEl.querySelector(".__bgRowSel");
    if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
  }
