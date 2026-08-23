  /* ---------- Per-row actions menu (send now / duplicate / delete) ----------
     One kebab button next to the reorder arrows replaces the old inline send
     and delete buttons. The popup is body-mounted and position:fixed because
     the queue body scrolls (overflow-y:auto) and would clip an in-flow menu.
     The clock cell is deliberately NOT part of this menu - a schedule stays
     visible and clickable in the row itself. */
  var IC_DOTS = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.9"></circle><circle cx="12" cy="12" r="1.9"></circle><circle cx="12" cy="19" r="1.9"></circle></svg>';
  var IC_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"></path><path d="M22 2 15 22 11 13 2 9 22 2z"></path></svg>';
  var IC_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2.5"></rect><path d="M5 15H4.2A2.2 2.2 0 0 1 2 12.8V4.2A2.2 2.2 0 0 1 4.2 2h8.6A2.2 2.2 0 0 1 15 4.2V5"></path></svg>';
  var IC_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3.5" y1="6" x2="20.5" y2="6"></line><path d="M8.5 6V4.2A1.7 1.7 0 0 1 10.2 2.5h3.6A1.7 1.7 0 0 1 15.5 4.2V6"></path><path d="M18.2 6l-.8 13.3a2.1 2.1 0 0 1-2.1 2H8.7a2.1 2.1 0 0 1-2.1-2L5.8 6"></path></svg>';

  var _menuClose = null;    /* closes the open popup */
  var _menuAnchor = null;   /* the button it belongs to, for click-to-toggle */

  function closeRowMenu() { if (_menuClose) _menuClose(); }

  /* Why "Send now" cannot run right now - "" when it can. */
  function sendBlocked(it) {
    if (it.off) return "Skipped - enable this item before sending it";
    if (isBusy()) return "Claude is mid-turn - it sends on its own when the turn ends";
    if (flushing) return "Another message is being sent";
    return "";
  }

  function menuItem(icon, label, cls, disabledWhy, fn) {
    var b = btn("__qMenuItem" + (cls ? " " + cls : ""), disabledWhy || "");
    b.setAttribute("role", "menuitem");
    var ic = el("span", "__qMenuIcon");
    ic.innerHTML = icon;
    var tx = el("span");
    tx.textContent = label;
    b.appendChild(ic);
    b.appendChild(tx);
    if (disabledWhy) b.disabled = true;
    else b.addEventListener("click", function (ev) { ev.stopPropagation(); closeRowMenu(); fn(); });
    return b;
  }

  /* Anchor under the button, flipped up / pulled in when it would overflow. */
  function placeMenu(menu, anchor) {
    var r = anchor.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
    var left = r.left;
    if (left + w > window.innerWidth - 6) left = window.innerWidth - 6 - w;
    if (left < 6) left = 6;
    var top = r.bottom + 4;
    if (top + h > window.innerHeight - 6) top = Math.max(6, r.top - 4 - h);
    menu.style.left = left + "px";
    menu.style.top = top + "px";
  }

  function openRowMenu(it, anchor) {
    closeRowMenu();
    var menu = el("div", "__qMenu");
    menu.setAttribute("role", "menu");
    menu.tabIndex = -1;
    menu.appendChild(menuItem(IC_SEND, "Send now", "", sendBlocked(it), function () { sendNow(it); }));
    menu.appendChild(menuItem(IC_COPY, "Duplicate", "", "", function () { duplicateItem(it); }));
    menu.appendChild(menuItem(IC_TRASH, "Delete", "__qMenuDanger", "", function () { removeItem(it); }));

    function close() {
      /* Only hand focus back if it is still ours - a rebuild (render) drops the
         button, and stealing focus then would fight the composer. */
      var mine = menu.contains(document.activeElement);
      if (menu.parentNode) menu.parentNode.removeChild(menu);
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      anchor.classList.remove("__qMenuOn");
      _menuClose = null;
      _menuAnchor = null;
      if (mine && anchor.isConnected) anchor.focus();
    }
    /* contains(), not ===: the click may land on the icon inside either element. */
    function onDoc(ev) { if (!menu.contains(ev.target) && !anchor.contains(ev.target)) close(); }
    function onKey(ev) { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(); } }

    document.body.appendChild(menu);
    placeMenu(menu, anchor);
    anchor.classList.add("__qMenuOn");
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);   /* capture: also the queue body's own scroll */
    _menuClose = close;
    _menuAnchor = anchor;
    /* Focus the box, not the first item: a mouse-opened menu would otherwise
       show a focus ring on it. Tab from here still walks the items. */
    try { menu.focus(); } catch (e) {}
  }

  function buildRowMenu(it) {
    var b = btn("__qMenuBtn", "More actions");
    b.innerHTML = IC_DOTS;
    b.setAttribute("aria-haspopup", "menu");
    b.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (_menuAnchor === b) closeRowMenu(); else openRowMenu(it, b);
    });
    return b;
  }
