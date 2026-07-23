  function buildRow(it, i) {
    var row = el("div", "__qRow" + (it.off ? " __qOff" : ""));
    var check = el("span", "__qCheck" + (it.off ? "" : " __qOn"));
    check.textContent = it.off ? "" : "\u2713";
    check.title = it.off ? "Skipped - won't be sent (click to enable)" : "Will be sent (click to skip)";
    check.addEventListener("click", function () { toggleSkip(it); });
    var num = el("input", "__qNum");
    num.type = "text";
    num.inputMode = "numeric";
    num.value = (i + 1);
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
      var cur = Q.indexOf(it) + 1;
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
    text.addEventListener("input", function () { it.text = text.textContent; });
    text.addEventListener("keydown", function (ev) {
      ev.stopPropagation();
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); text.blur(); }
    });
    var del = btn("__qDel", "Remove from queue");
    del.textContent = "\u2715";
    del.addEventListener("click", function () { removeAt(i); });
    row.appendChild(buildNav(i));
    row.appendChild(check);
    row.appendChild(num);
    row.appendChild(text);
    if (it.files && it.files.length) row.appendChild(buildThumbs(it.files));
    row.appendChild(del);
    return row;
  }

  function buildBody() {
    var body = el("div", "__qBody");
    if (bodyMax) body.style.maxHeight = bodyMax + "px";
    Q.forEach(function (it, i) { body.appendChild(buildRow(it, i)); });
    return body;
  }

  function render() {
    /* A rebuild destroys any focused position input, so clear the edit flag -
       otherwise an external re-render could leave it stuck true and freeze flushing. */
    editing = false;
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

  /* ---------- Panel resize ---------- */
  function startResize(ev) {
    ev.preventDefault();
    var body = panel && panel.querySelector(".__qBody");
    if (!body) return;
    var startY = ev.clientY, startH = body.getBoundingClientRect().height;
    function move(e) {
      var dy = startY - e.clientY;
      bodyMax = Math.max(48, Math.min(window.innerHeight * 0.8, startH + dy));
      body.style.maxHeight = bodyMax + "px";
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /* ---------- Composer interception (enqueue while busy) ---------- */
  function commitComposerToQueue(ev, e) {
    var t = (e.textContent || "").trim();
    if (!t) return;
    var files = readChips();
    ev.preventDefault();
    ev.stopImmediatePropagation();
    enqueue(t, files);
    setText(e, "");
    if (files.length) clearChips();
    render();
  }

  function onComposerKeydown(ev) {
    try {
      if (flushing) return;
      var e = inp();
      if (!e || ev.target !== e) return;
      if (ev.key !== "Enter" || ev.shiftKey || ev.isComposing) return;
      if (useCtrlEnter() && !(ev.ctrlKey || ev.metaKey)) return;
      if (suggestionsOpen()) return;
      if (!isBusy()) return;
      if (hasUnmanagedChips()) return;
      commitComposerToQueue(ev, e);
    } catch (err) {}
  }

  function onComposerSubmit(ev) {
    try {
      if (flushing) return;
      var e = inp();
      if (!e) return;
      var f = e.closest("form");
      if (!f || ev.target !== f) return;
      if (!isBusy()) return;
      if (hasUnmanagedChips()) return;
      commitComposerToQueue(ev, e);
    } catch (err) {}
  }

