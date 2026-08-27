  /* ---------- Asking before something is lost ----------

     The picker is one click deep, and while a loop is running two of those clicks
     throw work away: another responder restarts the count and the once-ledger,
     and turning it off does that and kills a run in flight. Neither is
     recoverable and neither used to ask.

     It asks only when there is something to lose - nothing armed, no question -
     and it says what goes rather than "are you sure": the count, because that is
     the brake, and the run in flight when there is one.

     The same three surfaces as the responders dialog, and the same overlay: one
     set of planes in this feature, not two. */
  var confirmNode = null;

  function confirmOpen() { return !!confirmNode; }

  function closeConfirm() {
    if (confirmNode && confirmNode.parentNode) confirmNode.parentNode.removeChild(confirmNode);
    confirmNode = null;
    document.removeEventListener("keydown", onConfirmKey, true);
  }

  /* Escape cancels and Enter confirms, and this handler is registered last so it
     takes the key before the dialog underneath it does. */
  function onConfirmKey(ev) {
    if (!confirmNode) return;
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); closeConfirm(); }
    else if (ev.key === "Enter") {
      ev.preventDefault(); ev.stopPropagation();
      var go = confirmNode.__afGo;
      closeConfirm();
      if (go) go();
    }
  }

  /* What this arming would cost, in the words of what it is: the count is the
     brake, and a run in flight is a call already paid for. */
  function costOfLosingArming() {
    var bits = [];
    if (turns > 0) bits.push(turns + (turns === 1 ? " turn" : " turns") + " counted");
    if (pending) bits.push("a run in flight");
    if (!bits.length) return "";
    return bits.join(" and ") + (bits.length === 1 ? " goes" : " go") + " with it.";
  }

  function askConfirm(title, detail, label, go) {
    closeConfirm();
    var ov = el("div", "__afOverlay __afConfirmOv");
    var box = el("div", "__afDlg __afConfirm");

    var head = el("div", "__afDlgHead");
    var h3 = el("h3");
    txt(h3, title);
    head.appendChild(h3);
    box.appendChild(head);

    var body = el("div", "__afConfirmBody");
    txt(body, detail);
    box.appendChild(body);

    var foot = el("div", "__afFoot");
    var spacer = el("span", "__afSpacer");
    foot.appendChild(spacer);
    var cancel = el("span", "__afB __afGhost");
    txt(cancel, "Cancel");
    press(cancel, function () { closeConfirm(); }, "button");
    var ok = el("span", "__afB __afPri");
    txt(ok, label);
    press(ok, function () { closeConfirm(); go(); }, "button");
    foot.appendChild(cancel);
    foot.appendChild(ok);
    box.appendChild(foot);

    ov.appendChild(box);
    press(ov, function (ev) { if (ev && ev.target === ov) closeConfirm(); });
    document.body.appendChild(ov);
    ov.__afGo = go;
    confirmNode = ov;
    document.addEventListener("keydown", onConfirmKey, true);
    try { ok.focus(); } catch (e) {}
  }

  /* The one entry point the picker uses: run the action, asking first when a loop is
     already armed and the click would end or replace it. */
  function confirmArmingChange(kind, name, go) {
    if (!armed) { go(); return; }
    var cost = costOfLosingArming();
    if (kind === "switch") {
      askConfirm("Switch responder?",
        (meta ? meta.name : armed) + " is running. " + (cost ? cost + " " : "")
          + name + " starts a new count.",
        "Switch", go);
    } else {
      askConfirm("Turn off auto follow-up?",
        (meta ? meta.name : armed) + " is running. " + (cost || "Nothing is queued for it."),
        "Turn off", go);
    }
  }
