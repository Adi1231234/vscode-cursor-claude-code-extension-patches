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

  function plainItem(label, fn, hint) {
    var it = el("div", "__afItem __afPlain");
    txt(it, label);
    if (hint) { var s = el("span"); txt(s, hint); it.appendChild(s); }
    press(it, function () { closeMenu(); fn(); });
    return it;
  }

  function openMenu(anchor) {
    var m = el("div", "__afMenu");
    var head = el("div", "__afMenuHead");
    txt(head, "Auto follow-up");
    m.appendChild(head);

    /* Done is a state you can leave. The reason is above the item because it is
       what decides whether continuing is worth anything: a run that ended on its
       budget has more to do, and one that ended on its own stop condition has
       already decided that it has not. */
    if (stopped && stoppedId) {
      var why = el("div", "__afMenuWhy");
      txt(why, stopped);
      m.appendChild(why);
      var r0 = findResponder(stoppedId);
      m.appendChild(plainItem("Continue " + ((r0 && r0.name) || stoppedId), resume,
                              "keeps the claims, the count and what it already asked"));
      m.appendChild(el("div", "__afSep"));
    }

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

