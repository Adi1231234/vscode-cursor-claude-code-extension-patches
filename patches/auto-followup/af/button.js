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

  /* What the responder file says. */
  function baseTurns() {
    var v = meta && String(meta.max_turns || "").trim().toLowerCase();
    if (!v || v === "unlimited" || v === "0" || v === "none") return 0;
    var n = parseInt(v, 10);
    return isFinite(n) && n > 0 ? n : 0;
  }

  /* What it is allowed now, which is that plus whatever continuing has added.
     Unlimited stays unlimited - there is nothing to add to. */
  function maxTurns() {
    var n = baseTurns();
    return n ? n + extraTurns : 0;
  }

  /* Why the loop is not acting. stateNote() next door says this too, but it
     cannot say it here: it returns "" until there is a slot, and the queue
     gate in maybeRun fires before a slot can exist - so the one state that
     explains an armed loop doing nothing was the one state with nothing on
     screen. Found by reading a queue out of leveldb, which is not a thing a
     user can do. */
  function holdNote() {
    var api = qApi();
    if (!api) return " · held: the queue patch is not loaded";
    if (api.busy()) return "";                   /* a turn is running, not a hold */
    if (api.paused()) return " · held: the queue is paused";
    var n = api.count();
    if (n) return " · held: " + n + " in the queue";
    return "";
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
                      + (paused ? " · paused" : holdNote());
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
    var t = tipText();
    var tip = b.querySelector(".__afTip");
    if (tip) {
      txt(tip, t);
      tip.className = "__afTip" + (stopped ? " __afTipWide" : "");
    }
    /* On the node as well as in it: the tip span is produced by innerHTML and
       is not reachable in every host, and what the button is saying should be
       readable wherever the button is - the way the count already is. */
    b.__afTip = t;
  }
