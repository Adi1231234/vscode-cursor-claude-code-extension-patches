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
    /* Connected is not the same as on screen. The queue panel is display:none
       whenever the queue is empty - which is the only state this loop ever runs
       in, because it refuses to run while the user has anything queued. Testing
       for isConnected put every follow-up ever generated into a hidden box: the
       counter moved, the lane existed, and nothing was on the screen.

       getClientRects() is empty for anything with no layout box, which is the
       question actually being asked. */
    if (p && p.getClientRects && p.getClientRects().length) {
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
    if (!slot) return pending ? "writing…" : "";
    if (api && api.paused()) return "paused";
    if (api && api.count()) return "waiting for the queue";
    if (!autosend()) return "waiting for approval";
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
    /* The header is the way in to what the responder is writing. It is the
       only part of the lane that is not the message itself, so it is the only
       part that can be clicked without getting in the way of editing. */
    head.setAttribute("title", "Show what the responder is writing");
    press(head, function () { openLive(); }, "button");
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
      txt(why, "chose: " + slot.why);
      laneNode.appendChild(why);
    }
  }

  function renderAll() {
    try { ensureButton(); } catch (e) {}
    try { renderLane(); } catch (e) {}
    /* The live view is part of the state too. It has a timer of its own for the
       clock, and leaving it to that meant the answer appeared in the view up to a
       second after it had already been queued. It returns immediately when the
       view is closed, which is nearly always. */
    try { renderLive(); } catch (e) {}
    /* Every state change in this script ends by rendering, so this is the one
       place that catches all of them. tick() calls saveState() too, which is
       what covers a change made outside a render - but relying on the tick
       alone left a 300ms window in which a reload lost the last transition. */
    try { saveState(); } catch (e) {}
  }
