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
    if (stopped) return "STOP — " + stopped;
    if (armed) return "Auto follow-up · " + (meta ? meta.name : armed);
    return "Auto follow-up — off";
  }

  function ensureButton() {
    var e = qInp();
    if (!e) return;
    var form = e.closest("form");
    if (!form) return;
    var add = form.querySelector(".__qAdd");
    /* background-tasks' indicator anchors itself with the same rule as this one -
       "be the element immediately before .__qAdd" - and only one element can be.
       Each timer saw the other in the slot and moved itself there, displacing it,
       about three times a second: measured at 11 inserts and 11 removals in three
       seconds, two DOM orders differing only in which of the two came first, and
       the button oscillating 42px. The lab never showed it because the indicator
       only exists while a background task is running.

       So this one takes the slot before the indicator rather than competing for
       the one after it. Both rules are then satisfiable at once and neither moves
       again: the indicator sits immediately before .__qAdd, and this sits
       immediately before the indicator. When the indicator appears it inserts
       itself between this button and .__qAdd, which is where this button already
       wanted it - so nothing moves then either. */
    var anchor = form.querySelector(".__bgInd") || add ||
                 form.querySelector('[class*="sendButton"]');
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
    if (anchor.previousElementSibling !== b) anchor.parentNode.insertBefore(b, anchor);
  }

  function paintButton(b) {
    var cls = "__afBtn";
    if (stopped) cls += " __afDone";
    else if (armed) cls += " __afOn";
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
