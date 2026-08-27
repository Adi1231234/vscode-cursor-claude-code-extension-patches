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
      /* Both of these throw the count away while a loop is running, so both
         ask first. Arming from nothing does not - there is nothing to lose. */
      if (armed === r.id) confirmArmingChange("off", r.name || r.id, function () { disarm(null); });
      else confirmArmingChange("switch", r.name || r.id, function () { arm(r.id); });
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
      /* Never say "you have none" about something never asked for. */
      txt(empty, listSeen ? "No responders yet." : "Loading…");
      m.appendChild(empty);
    } else {
      list.forEach(function (r) { m.appendChild(menuItem(r)); });
    }

    m.appendChild(el("div", "__afSep"));
    /* Above Manage, because holding it for a turn is the thing that happens
       often and editing a responder is the thing that does not. */
    if (armed && !stopped) {
      m.appendChild(plainItem(paused ? "Resume" : "Pause", function () {
        setPaused(!paused);
      }));
    }
    m.appendChild(plainItem("Manage responders…", openDialog));
    if (armed || stopped) m.appendChild(plainItem("Turn off", function () {
      confirmArmingChange("off", "", function () { disarm(null); });
    }));

    document.body.appendChild(m);
    place(m, anchor);
    menuNode = m;
    menuAnchor = anchor;
    setTimeout(function () { document.addEventListener("mousedown", onOutside, true); }, 0);
  }

  /* Where a popup goes.

     Two callers, two frames of reference. The responder menu hangs off a
     toolbar button and belongs to the panel, so the panel is what bounds it and
     centring on the button is right. A field's list belongs to the dialog it
     was opened in - bounded by the panel instead, it ran out over the dialog's
     own header and past both its edges, which reads as a menu that lost its
     dialog. Measured at a 342px panel: the list spanned 10 to 322 inside a
     dialog spanning 21 to 321.

     So bounds is the frame the popup belongs to, and a list aligns to the start
     of its field rather than centring on it, which is where a select opens
     everywhere else. */
  function rectOf(node) {
    if (!node) return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    var r = node.getBoundingClientRect();
    return { left: r.left, top: r.top,
             right: r.right === undefined ? r.left + (r.width || 0) : r.right,
             bottom: r.bottom === undefined ? r.top + (r.height || 0) : r.bottom };
  }

  function place(m, anchor, o) {
    o = o || {};
    var pad = 8;
    var b = rectOf(o.bounds);
    var r = anchor.getBoundingClientRect();
    /* Cap first, measure after: a list longer than its frame scrolls inside it
       rather than deciding there is nowhere it fits. */
    var room = b.bottom - b.top - pad * 2;
    if (room > 0 && m.offsetHeight > room) m.style.maxHeight = room + "px";
    var w = m.offsetWidth, h = m.offsetHeight;
    var below = r.bottom + 6, above = r.top - h - 6;
    var top = o.below ? (below + h <= b.bottom - pad ? below : above)
                      : (above >= b.top + pad ? above : below);
    var left = o.start ? r.left : r.left + r.width / 2 - w / 2;
    m.style.top = Math.max(b.top + pad, Math.min(top, b.bottom - pad - h)) + "px";
    m.style.left = Math.max(b.left + pad, Math.min(left, b.right - pad - w)) + "px";
  }
