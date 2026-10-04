  /* ---------- The surface phone control consumes ----------
     patches/phone-queue drives this queue from the Claude app: a /queue
     command typed on the phone reaches the extension host, the host posts it
     to the panel holding that conversation, and run() applies it and answers
     with the queue as it now stands, and the item it acted on. Every edit
     goes through the function the panel's own control calls - nothing here
     re-implements one. Commands on one item are remote-item.js. */

  /* What the phone needs to draw a row, and nothing it would have to know the
     queue's internals to read: attachments stay behind, only their count goes. */
  function remoteView(it) {
    return {
      id: it.id,
      text: it.text,
      mode: it.mode || "queue",
      at: it.at || null,
      dur: it.dur || null,
      hold: !!it.hold,
      off: !!it.off,
      missed: !!it.missed,
      rearm: !!it.rearm,
      files: (it.files || []).length
    };
  }

  function remoteSnapshot() {
    return {
      paused: paused,
      scheduled: floatItems().map(remoteView),
      lane: laneItems().map(remoteView)
    };
  }

  /* Why a schedule cannot be set, "" when it can. The mod parses these, but
     a timer with no length would get a moment of NaN and, holding by default,
     block the order behind it for good - so the queue checks for itself. */
  function badSchedule(c) {
    var length = typeof c.dur === "number" && isFinite(c.dur) && c.dur > 0;
    if ((c.mode === "timer" || c.mode === "after") && !length) return "Give a length, like 10m";
    if (c.mode === "time" && !(typeof c.at === "number" && isFinite(c.at))) return "Give a time, like 14:30";
    if (c.mode === "time" && !(c.at > Date.now())) return "That time has already passed";
    return "";
  }

  /* An add from the phone is an ordinary item, like __qAuto.add and unlike
     the composer's Alt+Enter: that one pauses an idle queue so a batch can be
     built, and from the phone the hold is a command of its own. */
  function remoteAdd(c) {
    var text = String(c.text || "").trim();
    if (!text) return { error: "Nothing to add" };
    var bad = badSchedule(c);
    if (bad) return { error: bad };
    enqueue(text, [], false);
    var it = Q[Q.length - 1];
    return { error: remoteSchedule(it, c), item: it };
  }

  /* The schedule the panel's dialog would set: mode "queue" clears it, a timer
     runs from now, and the hold is the dialog's default unless one is given. */
  function remoteSchedule(it, c) {
    var bad = badSchedule(c);
    if (bad) return bad;
    if (c.mode === "timer" || c.mode === "time" || c.mode === "after") {
      var hold = typeof c.hold === "boolean" ? c.hold : holdDefault(c.mode);
      setSchedule(it, c.mode, c.mode === "timer" ? Date.now() + c.dur : c.at, c.dur, hold);
    } else if (isScheduled(it)) {
      setSchedule(it, "queue");
    } else {
      render();
    }
    return "";
  }

  /* Applied, then answered: { error } ("" when it went through) and the item
     it acted on, so the phone can name it. */
  function remoteApply(c) {
    if (c.op === "list") return { error: "" };
    if (c.op === "pause") { setPaused(true); return { error: "" }; }
    if (c.op === "play") { setPaused(false); return { error: "" }; }
    if (c.op === "add") return remoteAdd(c);
    var it = remoteItem(c.ref);
    if (!it) {
      return { error: /^id:/.test(String(c.ref)) ? "That item is no longer in the queue"
        : "There is no item " + (c.ref || "") + " - send /queue list to see the numbers" };
    }
    return { error: remoteOnItem(c, it), item: it };
  }

  function remoteRun(c) {
    var out = { error: "" };
    c = c || {};
    try { out = remoteApply(c); } catch (e) { out = { error: String((e && e.message) || e) }; }
    /* Logged with the outcome, so a phone command that "did nothing" can be
       told apart from one that never arrived (Ctrl+Alt+L). */
    ccLog("phone", c.op || "?", c.ref || "", out.error || "applied");
    return { error: out.error || "", item: out.item ? remoteView(out.item) : null, queue: remoteSnapshot() };
  }

  /* The conversation this queue holds, read now rather than as of the last
     pass: phone-queue/webview/link.js checks a command against it, and a
     switch of conversation must not be missed for want of a pass. syncSession
     is what a pass runs first anyway, and is a no-op when nothing changed. */
  function remoteSid() {
    syncSession();
    return _curSid || "";
  }

  window.__qRemote = window.__qRemote || {
    run: remoteRun,
    sid: remoteSid
  };
