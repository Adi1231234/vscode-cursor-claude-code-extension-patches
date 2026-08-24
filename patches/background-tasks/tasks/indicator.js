
  /* ---------- Composer-footer indicator ----------
     Sits in the footer row the prompt-queue add button already lives in, just
     before it, so the cluster reads [running] [queue add] [send]. Present only
     while something is running. React re-renders that row, so it is re-anchored
     from a MutationObserver rather than a timer. */

  var indEl = null;

  function ensureIndicator() {
    var n = runningCount();
    var done = snapshot().finished.length;
    var e = inp();
    var form = e && e.closest ? e.closest("form") : null;
    if (!form) return;
    var existing = form.querySelector(".__bgInd");
    if (!n && !done) {
      if (existing) existing.remove();
      indEl = null;
      return;
    }
    var send = form.querySelector('[class*="sendButton"]');
    if (!send || !send.parentNode) return;

    var b = existing;
    if (!b) {
      b = btn("__bgInd __bgRoot", "Background tasks");
      b.innerHTML = SPINNER + '<span class="__bgCount"></span><span class="__bgTip" aria-hidden="true"></span>';
      b.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        openDialog();
      });
    }
    indEl = b;

    var target = form.querySelector(".__qAdd") || send;
    if (target.previousElementSibling !== b) target.parentNode.insertBefore(b, target);

    /* Animated with a count while something runs; a quiet glyph afterwards, so the
       finished list stays reachable without a permanent fixture in the footer. */
    b.className = "__bgInd __bgRoot" + (n ? "" : " __bgIdle");
    var count = b.querySelector(".__bgCount");
    if (count) count.textContent = n ? String(n) : "";
    var tip = b.querySelector(".__bgTip");
    if (tip) tip.textContent = n ? tipText(n) : (done === 1 ? "1 finished task" : done + " finished tasks");
  }

  function tipText(n) {
    var snap = snapshot(), names = [];
    for (var i = 0; i < snap.running.length && i < 4; i++) names.push(oneLine(label(snap.running[i]), 44));
    var more = snap.running.length - names.length;
    if (more > 0) names.push("+" + more + " more");
    return (n === 1 ? "1 task running" : n + " tasks running") + (names.length ? " · " + names.join(" · ") : "");
  }

  /* One coalesced pass drives both the indicator and the open dialog. A timer, not
     requestAnimationFrame: the panel is often hidden (another view is showing) and
     a hidden document never gets a frame, so rAF would silently stall the UI. */
  var queued = false;

  function changed() {
    if (queued) return;
    queued = true;
    setTimeout(function () {
      queued = false;
      /* The history read has to start here and not only when the dialog opens,
         or it can never start at all: the indicator is only drawn when something
         is running OR something has finished, "finished" is what the history read
         fills in, and the dialog is only reachable through the indicator. After a
         window reload the store is empty while the session's logs are still on
         disk, so without this the finished tasks from before the reload are
         unreachable - measured: "1 finished task" before a reload, no indicator at
         all after one. askHistory is a no-op until the session id is known and
         after it has asked once. */
      try { askHistory(); } catch (e) {}
      try { ensureIndicator(); } catch (e) {}
      try { renderDialog(); } catch (e) {}
    }, 0);
  }
