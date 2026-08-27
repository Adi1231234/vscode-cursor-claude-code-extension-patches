  /* ---------- The lane ----------
     The generated message, shown inside the queue panel but below a rule of its
     own, so the two lanes are visibly separate and the precedence between them is
     legible: the user's items are above, this is below, and this one waits.

     Rendered into the queue's panel node when there is one, and into a panel of
     its own when there is not - the queue hides its panel when nothing is queued,
     which is most of the time while a loop runs. */
  var laneNode = null, soloNode = null;

  function laneHost() {
    var api = qApi();
    var p = api && api.panel();
    if (p) {
      if (soloNode && soloNode.parentNode) { soloNode.parentNode.removeChild(soloNode); soloNode = null; }
      return p;
    }
    if (!soloNode || !soloNode.isConnected) {
      var e = qInp();
      var form = e && e.closest("form");
      if (!form || !form.parentNode) return null;
      soloNode = el("div", "__qPanel __afSolo");
      soloNode.style.display = "flex";
      form.parentNode.insertBefore(soloNode, form);
    }
    return soloNode;
  }

  function removeLane() {
    if (laneNode && laneNode.parentNode) laneNode.parentNode.removeChild(laneNode);
    laneNode = null;
    if (soloNode && soloNode.parentNode) { soloNode.parentNode.removeChild(soloNode); soloNode = null; }
  }

  function laneLabel() {
    var s = el("span", "__afLabel");
    var em = el("em");
    txt(em, "auto");
    s.appendChild(em);
    s.appendChild(document.createTextNode(" · " + (meta ? meta.name : armed)));
    return s;
  }

  function stateNote() {
    var api = qApi();
    if (!slot) return pending ? "כותב…" : "";
    if (api && api.paused()) return "מושהה";
    if (api && api.count()) return "ממתין לתור";
    if (!autosend()) return "ממתין לאישור";
    return "";
  }

  function renderLane() {
    if (!armed || (!slot && !pending)) { removeLane(); return; }
    var host = laneHost();
    if (!host) return;

    if (!laneNode || !laneNode.isConnected || laneNode.parentNode !== host) {
      if (laneNode && laneNode.parentNode) laneNode.parentNode.removeChild(laneNode);
      laneNode = el("div", "__afLane");
      host.appendChild(laneNode);
    }
    laneNode.innerHTML = "";

    var head = el("div", "__afLaneHead");
    /* The release control, shown only while the first message is being held.
       Editing the row and then pressing this is the whole review step: after it,
       the rest of this arming flows without stopping. */
    if (slot && !autosend()) {
      var play = el("button", "__afPlay");
      play.type = "button";
      play.setAttribute("aria-label", "Send and let the loop run");
      on(play, "click", approve);
      head.appendChild(play);
    }
    head.appendChild(laneLabel());
    var note = el("span", "__afNote");
    txt(note, stateNote());
    head.appendChild(note);
    laneNode.appendChild(head);

    if (!slot) return;

    var row = el("div", "__afRow");
    var badge = el("span", "__afBadge");
    txt(badge, "auto");
    var body = el("div", "__afText" + (slot.invalid ? " __afInvalid" : ""));
    txt(body, slot.message);
    body.setAttribute("contenteditable", "true");   /* editable before it goes */
    body.addEventListener("input", function () { slot.message = body.textContent || ""; });
    row.appendChild(badge);
    row.appendChild(body);
    laneNode.appendChild(row);

    if (slot.why) {
      var why = el("div", "__afWhy");
      txt(why, "נבחר: " + slot.why);
      laneNode.appendChild(why);
    }
  }

  function renderAll() {
    try { ensureButton(); } catch (e) {}
    try { renderLane(); } catch (e) {}
  }
