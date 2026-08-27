  /* ---------- The picker ----------
     Arming is one click, because it is the gesture that happens often. Creating
     and editing sit behind 'Manage responders' in a dialog, because they happen
     rarely and need room.

     Positioned fixed against the button's own rectangle, like the queue's row
     menu: the composer is inside a scrolling column, and an absolutely positioned
     child would be clipped by it. */
  var menuNode = null;

  function closeMenu() {
    if (menuNode && menuNode.parentNode) menuNode.parentNode.removeChild(menuNode);
    menuNode = null;
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
