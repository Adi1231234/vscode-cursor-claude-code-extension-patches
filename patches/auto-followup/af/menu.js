  /* ---------- The picker ----------
     Arming is one click, because it is the gesture that happens often. Creating
     and editing sit behind 'Manage responders' in a dialog, because they happen
     rarely and need room.

     Positioned fixed against the button's own rectangle, like the queue's row
     menu: the composer is inside a scrolling column, and an absolutely positioned
     child would be clipped by it. */
  var menuNode = null;

  var menuAnchor = null;

  /* Rebuild the menu in place when the list arrives.

     toggleMenu asks the host for the responders and then builds the menu in the
     same breath, but the answer comes back in a message - so the first open after
     a reload was built against an empty list and read "No responders yet", and
     only a second open showed them. Nothing was broken except the timing, which
     is the worst kind of empty state: it tells the user they have nothing. */
  function refreshMenu() {
    if (!menuNode || !menuAnchor) return;
    var a = menuAnchor;
    closeMenu();
    openMenu(a);
  }

  function closeMenu() {
    if (menuNode && menuNode.parentNode) menuNode.parentNode.removeChild(menuNode);
    menuNode = null;
    menuAnchor = null;
    document.removeEventListener("mousedown", onOutside, true);
  }

  function onOutside(ev) {
    if (menuNode && !menuNode.contains(ev.target)) closeMenu();
  }

  function toggleMenu(ev) {
    if (menuNode) { closeMenu(); return; }
    requestList();                       /* always open against what is on disk now */
    openMenu(ev.currentTarget);
  }

  function menuItem(r) {
    var it = el("div", "__afItem" + (armed === r.id ? " __afSel" : ""));
    var dot = el("span", "__afDot" + (armed === r.id ? "" : " __afDotOff"));
    var t = el("span", "__afT");
    var nm = el("b");
    txt(nm, r.name || r.id);
    t.appendChild(nm);
    if (r.description) {
      var d = el("span");
      txt(d, r.description);
      t.appendChild(d);
    }
    it.appendChild(dot);
    it.appendChild(t);
    press(it, function () {
      closeMenu();
      if (armed === r.id) disarm(null); else arm(r.id);
    });
    return it;
  }

  function plainItem(label, fn) {
    var it = el("div", "__afItem __afPlain");
    txt(it, label);
    press(it, function () { closeMenu(); fn(); });
    return it;
  }

  function openMenu(anchor) {
    var m = el("div", "__afMenu");
    var head = el("div", "__afMenuHead");
    txt(head, "Auto follow-up");
    m.appendChild(head);

    if (!list.length) {
      var empty = el("div", "__afEmpty");
      txt(empty, "No responders yet.");
      m.appendChild(empty);
    } else {
      list.forEach(function (r) { m.appendChild(menuItem(r)); });
    }

    m.appendChild(el("div", "__afSep"));
    m.appendChild(plainItem("Manage responders…", openDialog));
    if (armed || stopped) m.appendChild(plainItem("Turn off", function () { disarm(null); }));

    document.body.appendChild(m);
    place(m, anchor);
    menuNode = m;
    menuAnchor = anchor;
    setTimeout(function () { document.addEventListener("mousedown", onOutside, true); }, 0);
  }

  /* Above the button when there is room, below it when there is not, and never
     off the left or right edge. */
  function place(m, anchor) {
    var r = anchor.getBoundingClientRect();
    var w = m.offsetWidth, h = m.offsetHeight;
    var top = r.top - h - 8;
    if (top < 8) top = Math.min(r.bottom + 8, window.innerHeight - h - 8);
    var left = r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    m.style.top = Math.max(8, top) + "px";
    m.style.left = left + "px";
  }
