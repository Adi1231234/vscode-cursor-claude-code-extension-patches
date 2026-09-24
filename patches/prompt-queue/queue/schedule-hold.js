  /* ---------- "Hold the queue": the switch that decides which group ----------
     An absolute schedule has two different intents behind it and they cannot
     be guessed from the time alone. "Wait 10 minutes" paces the queue, so it
     holds; "tomorrow at 9" is a commitment to a moment in the world and
     freezing four messages behind it for eighteen hours is almost never what
     was meant, so it does not. Each mode gets the default that is right for
     it (holdDefault) and this switch is how the other case is said out loud.

     The switch is the app's own, reproduced from its measurements rather than
     by borrowing its hashed class: a 32x18 track at radius 9 going from
     --app-input-border to --app-accent-color, a 14x14 thumb moving 2px to
     16px, both .15s, and no hover/focus state of its own - the row carries
     those. inset-inline-start rather than left, because the rtl patch flips
     this panel and a physical offset would leave the thumb on the wrong side. */
  function buildHoldRow(on, onToggle) {
    var row = btn("__qHoldRow");
    row.setAttribute("role", "switch");
    row.setAttribute("aria-checked", on ? "true" : "false");
    var txt = el("span", "__qHoldText");
    var lab = el("span", "__qHoldLabel");
    lab.textContent = "Hold the queue until this sends";
    var dsc = el("span", "__qHoldDesc");
    dsc.textContent = on
      ? "It keeps its place in the list and everything below it waits."
      : "It leaves the list order and sends at its time; the queue keeps running without it.";
    txt.appendChild(lab);
    txt.appendChild(dsc);
    row.appendChild(txt);
    row.appendChild(el("span", "__qSwitch" + (on ? " __qSwitchOn" : "")));
    row.addEventListener("click", function () { onToggle(!on); });
    return row;
  }

  /* What the choice costs, said before it is made rather than discovered
     afterwards: how many messages would pile up behind a hold, and when the
     chosen hour cannot be kept because something above already holds the lane
     past it. The second one is the case that has no other way of being seen -
     the item would simply send late, with nothing ever having said why. */
  function holdNote(it, at, hold) {
    if (!hold) return "";
    var g = gateAbove(it), n;
    if (g && at && g > at) {
      return "An item above holds the queue until " + fmtClock(g) +
        ", so this sends then, not at " + fmtClock(at) + ".";
    }
    n = heldBelow(it);
    if (!n) return "";
    return n === 1 ? "1 message below it will wait." : n + " messages below it will wait.";
  }
