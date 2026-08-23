
  /* ---------- Composer-footer indicator ----------
     Sits in the footer row the prompt-queue add button already lives in, just
     before it, so the cluster reads [running] [queue add] [send]. Present only
     while something is running. React re-renders that row, so it is re-anchored
     from a MutationObserver rather than a timer. */

  var indEl = null;

  function ensureIndicator() {
    var n = runningCount();
    var e = inp();
    var form = e && e.closest ? e.closest("form") : null;
    if (!form) return;
    var existing = form.querySelector(".__bgInd");
    if (!n) {
      if (existing) existing.remove();
      indEl = null;
      return;
    }
    var send = form.querySelector('[class*="sendButton"]');
    if (!send || !send.parentNode) return;

    var b = existing;
    if (!b) {
      b = btn("__bgInd", "Background tasks");
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

    var count = b.querySelector(".__bgCount");
    if (count) count.textContent = String(n);
    var tip = b.querySelector(".__bgTip");
    if (tip) tip.textContent = tipText(n);
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
      try { ensureIndicator(); } catch (e) {}
      try { renderDialog(); } catch (e) {}
    }, 0);
  }
