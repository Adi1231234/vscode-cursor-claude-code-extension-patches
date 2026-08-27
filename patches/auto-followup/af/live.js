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
  var liveRid = "";
  var liveParts = [];        /* {kind, text} in arrival order */
  var liveChars = 0;
  var liveStart = 0;
  var liveNode = null;
  var LIVE_MAX = 262144;

  function liveReset(rid) {
    liveRid = rid || "";
    liveParts = [];
    liveChars = 0;
    liveStart = Date.now();
    renderLive();
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
    fitLive();
    window.addEventListener("resize", fitLive);
    document.addEventListener("keydown", onLiveKey, true);
    renderLive();
  }

  function closeLive() {
    if (liveNode && liveNode.parentNode) liveNode.parentNode.removeChild(liveNode);
    liveNode = null;
    window.removeEventListener("resize", fitLive);
    document.removeEventListener("keydown", onLiveKey, true);
  }

  function onLiveKey(ev) {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    ev.stopPropagation();
    closeLive();
  }

  /* Same reason as the responders dialog: the zoom patch makes <body> the
     containing block for a fixed element, so inset:0 is the body box and not the
     screen. The ratio is measured rather than read, because CSS cannot see zoom. */
  function fitLive() {
    if (!liveNode) return;
    var ref = document.body;
    var seen = ref.getBoundingClientRect().height;
    var own = ref.offsetHeight;
    var scale = (own > 0 && seen > 0) ? (seen / own) : 1;
    if (!isFinite(scale) || scale <= 0) scale = 1;
    var h = document.documentElement.clientHeight || window.innerHeight || 0;
    var w = document.documentElement.clientWidth || window.innerWidth || 0;
    if (!h) return;
    liveNode.style.height = (h / scale) + "px";
    liveNode.style.width = (w / scale) + "px";
  }

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
    txt(count, liveChars ? (liveChars + " chars") : "");
    head.appendChild(count);
    var x = el("span", "__afX");
    txt(x, "✕");
    x.setAttribute("aria-label", "Close");
    press(x, closeLive);
    head.appendChild(x);
    box.appendChild(head);

    var body = el("div", "__afLiveBody");
    if (!liveParts.length) {
      var empty = el("div", "__afLiveEmpty");
      txt(empty, pending ? "waiting for the first words…"
                         : "nothing has been written this turn yet");
      body.appendChild(empty);
    } else {
      for (var i = 0; i < liveParts.length; i++) {
        var p = liveParts[i];
        var seg = el("div", "__afSeg " + (p.kind === "thinking" ? "__afSegThink" : "__afSegOut"));
        var tag = el("span", "__afSegTag");
        txt(tag, p.kind === "thinking" ? "thinking" : "output");
        seg.appendChild(tag);
        var pre = el("div", "__afSegText");
        pre.dir = "auto";
        txt(pre, p.text);
        seg.appendChild(pre);
        body.appendChild(seg);
      }
    }
    box.appendChild(body);
    liveNode.appendChild(box);

    /* Follow the tail only while the reader is already at it: scrolling back to
       read something is not an invitation to be yanked forward again. */
    if (atBottom) body.scrollTop = body.scrollHeight;
  }
