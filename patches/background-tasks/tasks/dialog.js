
  /* ---------- Dialog shell ----------
     A list-detail dialog. Side by side when there is room; below NARROW - which
     the panel very often is, being a sidebar - the two panes stack and the list
     hands over to the detail view with a back button, the standard small-screen
     form of this pattern. */

  var back = null;      /* backdrop element, null when closed */
  var modalEl = null;
  var bodyEl = null;
  var listEl = null;
  var headSub = null;
  var sel = null;       /* selected task id */
  var stacked = false;
  var showDetail = false;   /* stacked mode only: list or detail */
  var lastFocus = null;
  var sizeObs = null;

  function openDialog() {
    if (back) return;
    lastFocus = document.activeElement;
    back = el("div", "__bgBackdrop");
    modalEl = el("div", "__bgModal");
    modalEl.setAttribute("role", "dialog");
    modalEl.setAttribute("aria-modal", "true");
    modalEl.setAttribute("aria-label", "Background tasks");
    modalEl.appendChild(buildHead());
    bodyEl = el("div", "__bgBody");
    listEl = el("div", "__bgList");
    listEl.setAttribute("role", "listbox");
    listEl.setAttribute("aria-label", "Tasks");
    listEl.tabIndex = 0;
    listEl.addEventListener("keydown", onListKey);
    bodyEl.appendChild(listEl);
    bodyEl.appendChild(buildSplitter());
    bodyEl.appendChild(buildPane());
    modalEl.appendChild(bodyEl);
    back.appendChild(modalEl);
    back.addEventListener("mousedown", function (ev) { if (ev.target === back) closeDialog(); });
    document.body.appendChild(back);
    document.addEventListener("keydown", onKey, true);
    observeWidth();
    renderDialog();
    listEl.focus();
  }

  function buildHead() {
    var head = el("div", "__bgHead");
    var main = el("div", "__bgHeadMain");
    main.appendChild(el("div", "__bgTitle", "Background tasks"));
    headSub = el("div", "__bgHeadSub");
    main.appendChild(headSub);
    var close = iconBtn("__bgClose", "Close", ICON_CLOSE);
    close.addEventListener("click", closeDialog);
    head.appendChild(main);
    head.appendChild(close);
    return head;
  }

  function closeDialog() {
    if (!back) return;
    document.removeEventListener("keydown", onKey, true);
    if (sizeObs) { sizeObs.disconnect(); sizeObs = null; }
    back.remove();
    back = null; modalEl = null; bodyEl = null; listEl = null; headSub = null;
    listSig = null; showDetail = false;
    forgetHistoryRequest();
    resetPane();
    try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch (e) {}
  }

  /* Stacking follows the dialog's own width, not the viewport's: the panel is a
     sidebar whose width the user drags around. */
  function observeWidth() {
    var apply = function (w) {
      var next = w > 0 && w < NARROW;
      if (next === stacked) return;
      stacked = next;
      if (!stacked) showDetail = false;
      syncLayout();
      renderDialog();
    };
    if (window.ResizeObserver) {
      sizeObs = new ResizeObserver(function (es) { apply(es[0].contentRect.width); });
      sizeObs.observe(modalEl);
    }
    stacked = !stacked;                                  /* force the first apply */
    apply(modalEl.getBoundingClientRect().width || window.innerWidth);
    syncLayout();
  }

  function syncLayout() {
    if (!bodyEl) return;
    bodyEl.className = "__bgBody" + (stacked ? " __bgStacked" : "") + (stacked && showDetail ? " __bgShowDetail" : "");
    setBackVisible(stacked);
  }

  /* Only a keyboard hand-off moves focus into the pane; a click already put the
     caret where the user is looking, and stealing it draws a focus ring over the
     whole log for no reason. */
  function goDetail(withFocus) { if (stacked) { showDetail = true; syncLayout(); if (withFocus) focusPane(); } }
  function goList() { showDetail = false; syncLayout(); if (listEl) listEl.focus(); }
