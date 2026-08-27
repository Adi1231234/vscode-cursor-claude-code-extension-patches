  /* ---------- The live view ----------

     What the responder is writing, while it writes it. The lane shows the
     finished message and the one line of reasoning it reports; this shows the
     thinking and the output as they arrive, which is the only way to tell a
     model that is stuck from one that is being careful - and the only way to
     decide to stop it before it finishes.

     Everything here is for looking at. The buffers are never read by the loop:
     the result message stays the only thing acted on, so a delta that is
     malformed, truncated or arrives after the run has ended can make the view
     wrong and can do nothing worse than that.

     Kept per run id. A late chunk from a cancelled run cannot bleed into the
     next one, because the id it carries no longer matches. */
  var liveResult = null;   /* the parsed answer once it lands, for the view */
  var liveRawOpen = false;
  var liveRid = "";
  var liveParts = [];        /* {kind, text} in arrival order */
  var liveChars = 0;
  var liveStart = 0;
  var liveNode = null;
  var liveTimer = 0;
  var LIVE_MAX = 262144;

  function liveReset(rid) {
    liveRid = rid || "";
    liveParts = [];
    liveChars = 0;
    liveStart = Date.now();
    renderLive();
    liveResult = null;
  }

  function liveAppend(rid, kind, text) {
    if (!rid || rid !== liveRid) return;
    if (liveChars > LIVE_MAX) return;
    var t = String(text || "");
    liveChars += t.length;
    var last = liveParts[liveParts.length - 1];
    /* Deltas arrive a few characters at a time; one node per delta would be
       thousands of nodes for one answer. */
    if (last && last.kind === kind) last.text += t;
    else liveParts.push({ kind: kind, text: t });
    renderLive();
  }

  function liveHasAnything() { return liveParts.length > 0; }

  function liveOpen() { return !!liveNode; }

  function openLive() {
    if (liveNode) { closeLive(); return; }
    liveNode = el("div", "__afOverlay __afLiveOverlay");
    on(liveNode, "mousedown", function (ev) { if (ev.target === liveNode) closeLive(); });
    document.body.appendChild(liveNode);
    fitOverlay(liveNode);
    window.addEventListener("resize", fitLiveNow);
    /* Measured against the real CLI: the first delta arrived 16.2 s into an 18.1 s
       run, and the whole answer was written in the 1.1 s after it. Most of what
       this view shows is a wait, and a wait with no number on it reads as nothing
       happening - the clock is the difference between "it is stuck" and "it has
       not started talking yet". */
    liveTimer = setInterval(function () { try { renderLive(); } catch (e) {} }, 1000);
    document.addEventListener("keydown", onLiveKey, true);
    renderLive();
  }

  function closeLive() {
    if (liveNode && liveNode.parentNode) liveNode.parentNode.removeChild(liveNode);
    liveNode = null;
    if (liveTimer) { clearInterval(liveTimer); liveTimer = 0; }
    window.removeEventListener("resize", fitLiveNow);
    document.removeEventListener("keydown", onLiveKey, true);
  }

  function onLiveKey(ev) {
    if (ev.key !== "Escape") return;
    if (confirmOpen()) return;   /* the confirm is above this one */
    ev.preventDefault();
    ev.stopPropagation();
    closeLive();
  }

  /* A named function so it can be removed again: the resize listener has to be
     the same reference on both sides, and fitOverlay takes an argument. */
  function fitLiveNow() { fitOverlay(liveNode); }

  /* The size comes from the same function the responders dialog uses. It had a
     copy of it, and the copy was the version from before the zoom was measured
     rather than inferred - so the dialog fitted and this one hung out of the tab,
     which is exactly what two copies of one calculation buy. */

  function liveState() {
    if (pending) return "writing";
    if (stopped) return "stopped";
    if (slot) return "waiting for approval";
    return liveHasAnything() ? "finished" : "nothing yet";
  }

  function renderLive() {
    if (!liveNode) return;
    var atBottom = true;
    var oldBody = liveNode.querySelector(".__afLiveBody");
    if (oldBody) {
      atBottom = oldBody.scrollTop + oldBody.clientHeight >= oldBody.scrollHeight - 24;
    }
    liveNode.innerHTML = "";

    var box = el("div", "__afDlg __afLiveDlg");
    var head = el("div", "__afDlgHead");
    var h3 = el("h3");
    txt(h3, (meta ? meta.name : armed) || "auto follow-up");
    head.appendChild(h3);
    var st = el("span", "__afLiveState" + (pending ? " __afLiveOn" : ""));
    txt(st, liveState());
    head.appendChild(st);
    var count = el("span", "__afLiveCount");
    var secs = liveStart ? Math.max(0, Math.round((Date.now() - liveStart) / 1000)) : 0;
    txt(count, (liveChars ? liveChars + " chars · " : "") + secs + "s");
    head.appendChild(count);
    var x = el("span", "__afX");
    txt(x, "✕");
    x.setAttribute("aria-label", "Close");
    press(x, closeLive);
    head.appendChild(x);
    box.appendChild(head);

    var body = el("div", "__afLiveBody __ccScroll");

    /* A block per thing worth reading, in the order they matter: the message
       that will be typed, why this move was picked, and the claims it recorded.
       The raw stream is still there behind a toggle - it is what the model
       actually wrote and the only way to see a malformed answer - but it is not
       what the view is for. */
    function block(label, text, cls) {
      var seg = el("div", "__afSeg " + (cls || ""));
      var tag = el("span", "__afSegTag");
      txt(tag, label);
      seg.appendChild(tag);
      var pre = el("div", "__afSegText");
      pre.dir = "auto";
      txt(pre, text);
      seg.appendChild(pre);
      body.appendChild(seg);
      return seg;
    }

    var thinking = liveThinking();
    if (thinking) block("thinking", thinking, "__afSegThink");

    var raw = liveRaw();
    var done = liveResult;
    var msg = done ? (done.message || "") : "";
    var partial = false;
    if (!done) {
      var f = jsonField(raw, "message");
      if (f) { msg = f.text; partial = f.partial; }
    }

    if (msg) {
      block(partial ? "message so far" : "message", msg, "__afSegOut");
    } else if (raw) {
      /* Not JSON, or not yet - before the field appears, and for a model that
         answers in prose. Showing the stream is what this view did before
         anything was extracted from it, and it must never show less. */
      block("output", raw, "__afSegOut");
    } else if (!thinking) {
      var empty = el("div", "__afLiveEmpty");
      txt(empty, pending ? "waiting for the first words - nothing has been written yet"
                         : "nothing was written this turn");
      body.appendChild(empty);
    }

    if (done && done.why) block("why this move", done.why, "__afSegWhy");
    if (done && done.stop) block("stop condition met", done.stop, "__afSegStop");

    if (done && done.claims && done.claims.length) {
      var seg = el("div", "__afSeg __afSegClaims");
      var tag = el("span", "__afSegTag");
      txt(tag, done.claims.length + (done.claims.length === 1 ? " claim recorded" : " claims recorded"));
      seg.appendChild(tag);
      var list = el("ul", "__afClaimList");
      for (var c = 0; c < done.claims.length; c++) {
        var li = el("li");
        li.dir = "auto";
        txt(li, done.claims[c]);
        list.appendChild(li);
      }
      seg.appendChild(list);
      body.appendChild(seg);
    }

    /* Last, small, and off by default: the only way to see what a malformed
       answer actually said, and noise every other time. */
    if (raw) {
      var toggle = el("div", "__afRawToggle");
      txt(toggle, liveRawOpen ? "hide what the model wrote" : "show what the model wrote");
      press(toggle, function () { liveRawOpen = !liveRawOpen; renderLive(); }, "button");
      body.appendChild(toggle);
      if (liveRawOpen) block("raw", raw, "__afSegRaw");
    }

    box.appendChild(body);
    liveNode.appendChild(box);

    /* Follow the tail only while the reader is already at it: scrolling back to
       read something is not an invitation to be yanked forward again. */
    if (atBottom) body.scrollTop = body.scrollHeight;
  }
