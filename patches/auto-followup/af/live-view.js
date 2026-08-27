  /* ---------- Drawing the live view ----------

     What a person is doing at this window: waiting, then reading one question and
     deciding whether to let it go. Everything here follows from that.

     The message has no label. It is the first thing, the largest thing, and the
     only thing in prose - a tag over it would be a caption on a photograph of
     itself. The labels that remain are on the parts that would otherwise be
     ambiguous: why this move, the claims, the raw stream.

     Most of this view's life is a wait - measured against the real CLI, the first
     delta arrived 16.2 s into an 18.1 s run - so the wait is what the header is
     built around: the state, the clock, the character count, and a hairline that
     moves while there is something happening. It is deliberately indeterminate;
     nothing here knows how long the answer will be, and a bar that pretended to
     would be lying twice a minute.

     Line length is the other half. At a 900px panel the box is 720 wide, and a
     paragraph set across all of it is unreadable, so the message is capped at a
     measure and the rest of the width is left alone. */

  function liveHeader() {
    var head = el("div", "__afDlgHead __afLiveHead");

    var h3 = el("h3");
    txt(h3, (meta ? meta.name : armed) || "auto follow-up");
    head.appendChild(h3);

    var st = el("span", "__afLiveState" + (pending ? " __afLiveOn" : ""));
    txt(st, liveState());
    head.appendChild(st);

    /* Two numbers, one of which only moves while the other matters: how much has
       been written, and how long it has taken. Tabular so they do not jitter. */
    var count = el("span", "__afLiveCount");
    var secs = liveStart ? Math.max(0, Math.round((Date.now() - liveStart) / 1000)) : 0;
    txt(count, (liveChars ? liveChars + " chars · " : "") + secs + "s");
    head.appendChild(count);

    var x = el("span", "__afX");
    txt(x, "✕");
    x.setAttribute("aria-label", "Close");
    press(x, closeLive, "button");
    head.appendChild(x);
    return head;
  }

  function liveBlock(body, label, text, cls) {
    var seg = el("div", "__afSeg " + (cls || ""));
    if (label) {
      var tag = el("span", "__afSegTag");
      txt(tag, label);
      seg.appendChild(tag);
    }
    var pre = el("div", "__afSegText");
    pre.dir = "auto";
    txt(pre, text);
    seg.appendChild(pre);
    body.appendChild(seg);
    return seg;
  }

  function liveClaims(body, claims) {
    var seg = el("div", "__afSeg __afSegClaims");
    var tag = el("span", "__afSegTag");
    txt(tag, claims.length + (claims.length === 1 ? " claim recorded" : " claims recorded"));
    seg.appendChild(tag);
    /* An ordered list because they are ordered: each one is numbered by the turn
       that produced it, and that number is how the ledger refers back to them. */
    var list = el("ol", "__afClaimList");
    for (var c = 0; c < claims.length; c++) {
      var li = el("li");
      li.dir = "auto";
      txt(li, claims[c]);
      list.appendChild(li);
    }
    seg.appendChild(list);
    body.appendChild(seg);
  }

  function renderLive() {
    if (!liveNode) return;
    /* Follow the tail only while the reader is already at it: scrolling back to
       read something is not an invitation to be yanked forward again. */
    var oldBody = liveNode.querySelector(".__afLiveBody");
    var atBottom = !oldBody
      || oldBody.scrollTop + oldBody.clientHeight >= oldBody.scrollHeight - 24;
    liveNode.innerHTML = "";

    var box = el("div", "__afDlg __afLiveDlg");
    box.appendChild(liveHeader());
    var bar = el("div", "__afLiveBar" + (pending ? " __afLiveBarOn" : ""));
    box.appendChild(bar);

    var body = el("div", "__afLiveBody __ccScroll");
    var thinking = liveThinking();
    var raw = liveRaw();
    var done = liveResult;
    var msg = done ? (done.message || "") : "";
    var partial = false;
    if (!done) {
      var f = jsonField(raw, "message");
      if (f) { msg = f.text; partial = f.partial; }
    }

    if (thinking) liveBlock(body, "thinking", thinking, "__afSegThink");

    if (msg) {
      liveBlock(body, "", msg, "__afSegMsg" + (partial ? " __afSegWriting" : ""));
    } else if (raw) {
      /* Not JSON, or not yet - before the field appears, and for a model that
         answers in prose. Showing the stream is what this view did before
         anything was extracted from it, and it must never show less. */
      liveBlock(body, "output", raw, "__afSegOut");
    } else {
      var empty = el("div", "__afLiveEmpty");
      txt(empty, pending ? "nothing written yet" : "nothing was written this turn");
      body.appendChild(empty);
    }

    if (done && done.why) liveBlock(body, "why this move", done.why, "__afSegWhy");
    if (done && done.stop) liveBlock(body, "stop condition met", done.stop, "__afSegStop");
    if (done && done.claims && done.claims.length) liveClaims(body, done.claims);

    /* Last, quiet, and only when something else is above it: with the raw stream
       already on screen a toggle for it is a button that does nothing. */
    if (raw && msg) {
      var toggle = el("div", "__afRawToggle");
      txt(toggle, liveRawOpen ? "hide what the model wrote" : "show what the model wrote");
      press(toggle, function () { liveRawOpen = !liveRawOpen; renderLive(); }, "button");
      body.appendChild(toggle);
      if (liveRawOpen) liveBlock(body, "", raw, "__afSegRaw");
    }

    box.appendChild(body);
    liveNode.appendChild(box);
    if (atBottom) body.scrollTop = body.scrollHeight;
  }
