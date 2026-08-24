
  /* ---------- View controls ----------
     Filter, wrap and follow sit with the view they change, right above the feed.
     Follow is a state the user can also leave by scrolling up, so it is reflected
     both ways: the toggle lights up, and a "Jump to latest" affordance appears
     while a live task is scrolled away from its end. */

  var findInput = null, findCount = null;

  function buildTools() {
    var bar = el("div", "__bgTools");
    backBtn = iconBtn("__bgBack", "Back to the task list", ICON_BACK);
    backBtn.addEventListener("click", goList);
    bar.appendChild(backBtn);
    bar.appendChild(buildFind());
    wrapBtn = iconBtn("__bgWrap", "Wrap long lines", ICON_WRAP);
    wrapBtn.addEventListener("click", function () { wrap = !wrap; syncWrap(); });
    bar.appendChild(wrapBtn);
    followBtn = iconBtn("__bgFollow", "Follow new output", ICON_FOLLOW);
    followBtn.addEventListener("click", function () { follow = !follow; if (follow) stick(); syncFollow(); });
    bar.appendChild(followBtn);
    return bar;
  }

  function setBackVisible(on) { if (backBtn) backBtn.classList.toggle("__bgHidden", !on); }
  function focusPane() { if (paneBody) paneBody.focus(); }

  function onPaneScroll() {
    var atEnd = paneBody.scrollHeight - paneBody.scrollTop - paneBody.clientHeight < 24;
    if (atEnd !== follow) { follow = atEnd; syncFollow(); }
  }

  function syncFollow() {
    if (!followBtn) return;
    followBtn.classList.toggle("__bgOn", follow);
    followBtn.setAttribute("aria-pressed", follow ? "true" : "false");
    var live = paneFor && TASKS[paneFor] && isRunning(TASKS[paneFor]);
    jumpBtn.classList.toggle("__bgHidden", follow || !live);
  }

  function syncWrap() {
    if (!wrapBtn) return;
    wrapBtn.classList.toggle("__bgOn", wrap);
    wrapBtn.setAttribute("aria-pressed", wrap ? "true" : "false");
    paneBody.classList.toggle("__bgNoWrap", !wrap);
  }

  function buildFind() {
    var find = el("div", "__bgFind");
    findInput = el("input", "__bgFindInput");
    findInput.type = "text";
    findInput.placeholder = "Filter";
    findInput.setAttribute("aria-label", "Filter this log");
    findInput.addEventListener("input", refilter);
    find.appendChild(findInput);
    findCount = el("span", "__bgFindCount");
    findCount.setAttribute("aria-live", "polite");
    find.appendChild(findCount);
    return find;
  }

  function resetFilter() {
    if (findInput) findInput.value = "";
    if (findCount) findCount.textContent = "";
  }

  /* Hides entries rather than removing them, so the feed can keep appending and an
     emptied filter restores the view without a rebuild. */
  function refilter() {
    if (!paneBody || !findInput) return;
    var q = findInput.value.trim().toLowerCase();
    var kids = paneBody.children, shown = 0, total = 0;
    if (paneMode === "text") { filterText(q); return; }
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (!k.classList || !k.classList.contains("__bgEntry")) continue;
      total++;
      var hit = !q || (k.textContent || "").toLowerCase().indexOf(q) >= 0;
      k.classList.toggle("__bgFiltered", !hit);
      if (hit) shown++;
    }
    findCount.textContent = q ? shown + "/" + total : "";
    if (q && shown === 0) showNoMatch(true); else showNoMatch(false);
  }

  function filterText(q) {
    if (!bodyPre) return;
    var lines = textBuf.split(NL);
    if (!q) { bodyPre.textContent = textBuf; findCount.textContent = ""; showNoMatch(false); return; }
    var keep = [];
    for (var i = 0; i < lines.length; i++) if (lines[i].toLowerCase().indexOf(q) >= 0) keep.push(lines[i]);
    bodyPre.textContent = keep.join(NL);
    findCount.textContent = keep.length + "/" + lines.length;
    showNoMatch(keep.length === 0);
  }

  function showNoMatch(on) {
    var cur = paneBody.querySelector(".__bgNoMatch");
    if (!on) { if (cur) cur.remove(); return; }
    if (cur) return;
    paneBody.appendChild(emptyState("No matching lines", "Clear the filter to see the whole log."));
    paneBody.lastElementChild.classList.add("__bgNoMatch");
  }
