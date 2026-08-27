  /* ---------- The composer button ----------
     One control, left of the queue's own add button, and the only place the
     feature's state is shown: off, armed with a count, or finished with the
     reason on hover. It lives on the button rather than in the queue panel header
     because the panel is not always there - it collapses, and it disappears
     entirely when nothing is queued, which is exactly the state the loop spends
     most of its time in.

     Re-anchored on every tick, like the queue's add button: the app re-renders its
     own footer children, and insertBefore on an attached node just moves it, so
     this never duplicates. */
  function counterText() {
    if (stopped) return turns + " · done";
    var max = maxTurns();
    return max ? turns + "/" + max : String(turns);
  }

  function maxTurns() {
    var v = meta && String(meta.max_turns || "").trim().toLowerCase();
    if (!v || v === "unlimited" || v === "0" || v === "none") return 0;
    var n = parseInt(v, 10);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function tipText() {
    /* Said here because this is the one thing always on screen. Twice a change
       was applied, the window reloaded, and the old behaviour still showed -
       with no way to tell whether the reload had missed this window or the
       change had missed the mark. Now the window says which. */
    if (buildInfo && buildInfo.stale) {
      return "Auto follow-up - a newer build is installed, reload this window"
           + " (running " + buildInfo.running + ", on disk " + buildInfo.onDisk + ")";
    }
    if (stopped) return "STOP — " + stopped;
    if (armed) return "Auto follow-up · " + (meta ? meta.name : armed)
                      + (paused ? " · paused" : "");
    return "Auto follow-up — off";
  }

  /* Where this button belongs in the footer row. Ranks are spaced so a later
     patch can land between two of them without renumbering anything. */
  if (window.__ccRow) window.__ccRow.rank("__afBtn", 10);

  function ensureButton() {
    var e = qInp();
    if (!e) return;
    var form = e.closest("form");
    if (!form) return;
    var add = form.querySelector(".__qAdd");
    var send = form.querySelector('[class*="sendButton"]');
    /* One shared order instead of competing absolutes.

       Every injected button used to assert "be the element immediately before
       .__qAdd", and only one element can be - so two patches with that rule
       evicted each other for as long as both were on screen. Measured in a live
       panel: forty moves each in three seconds, alternating between two orders
       about every 150 ms.

       ccRow keeps the ranks and does the placing, so this file states where this
       button belongs and nothing about who else is in the row. Without it - a
       bundle where only this patch is installed - the old rule is still correct,
       because with one injected button there is nobody to argue with. */
    var anchor = send || add;
    if (!anchor || !anchor.parentNode) return;

    var b = form.querySelector(".__afBtn");
    if (!b) {
      b = el("button", "__afBtn");
      b.type = "button";
      b.setAttribute("aria-label", "Auto follow-up");
      on(b, "click", toggleMenu);
      form.__afBtn = b;
    }
    paintButton(b);
    /* Attach first: place() only orders nodes that are already in the row, so a
       button that has just been created - or one React has taken out - has to be
       put back before there is anything to sort. */
    if (b.parentNode !== anchor.parentNode) anchor.parentNode.insertBefore(b, anchor);
    if (window.__ccRow) window.__ccRow.place(anchor.parentNode, send || add);
    else if (anchor.previousElementSibling !== b) anchor.parentNode.insertBefore(b, anchor);
  }

  function paintButton(b) {
    var cls = "__afBtn";
    if (stopped) cls += " __afDone";
    else if (armed) cls += paused ? " __afHold" : " __afOn";
    if (b.className !== cls) b.className = cls;

    var want = (armed || stopped) ? counterText() : "";
    if (b.__afCount !== want || !b.firstChild) {
      b.__afCount = want;
      b.innerHTML = icon("loop") +
        (want ? '<span class="__afCn"></span>' : "") +
        '<span class="__afTip"></span>';
    }
    /* Both lookups are guarded, and the guard is not defensive noise: paintButton
       runs on every tick from inside tick()'s try/catch, so if innerHTML ever
       fails to produce these - a stricter CSP, a sanitiser - an unguarded write
       would throw every tick, silently, and freeze the button in a stale state
       with nothing in the console to say why. */
    var cn = b.querySelector(".__afCn");
    if (cn) txt(cn, want);
    var tip = b.querySelector(".__afTip");
    if (tip) {
      txt(tip, tipText());
      tip.className = "__afTip" + (stopped ? " __afTipWide" : "");
    }
  }
