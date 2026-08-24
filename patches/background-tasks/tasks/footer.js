
  /* ---------- Task actions ----------
     Ordered least destructive first, and Stop carries its own treatment so it never
     reads as just another button in the row. */

  function drawFoot(t) {
    clear(paneFoot);
    var left = el("div", "__bgFootMain");
    if (isRunning(t) && !t.backgrounded && t.toolUseId) {
      var bg = btn("__bgBtn", "Let this task keep running in the background");
      bg.textContent = "Run in background";
      bg.addEventListener("click", function () { sendToBackground(t); });
      left.appendChild(bg);
    }
    if (isRunning(t)) {
      var stop = btn("__bgBtn __bgBtnDanger", "Stop this task");
      stop.textContent = "Stop";
      stop.addEventListener("click", function () { stopTask(t); });
      left.appendChild(stop);
    }
    paneFoot.appendChild(left);

    var right = el("div", "__bgFootSide");
    var copy = iconBtn("__bgCopy", "Copy the log", ICON_COPY);
    copy.addEventListener("click", function () { copyLog(copy); });
    right.appendChild(copy);
    if (t.logPath) {
      var open = iconBtn("__bgOpen", "Open the log file in an editor tab", ICON_OPEN);
      open.addEventListener("click", function () { revealLog(t); });
      right.appendChild(open);
    }
    paneFoot.appendChild(right);
  }

  /* Feedback for an action with no visible result of its own. */
  function copyLog(b) {
    var text = paneMode === "text" ? (bodyPre ? bodyPre.textContent : "") : (paneBody.innerText || "");
    try { navigator.clipboard.writeText(text); } catch (e) {}
    var tip = b.querySelector(".__bgTip");
    if (!tip) return;
    var was = tip.textContent;
    tip.textContent = "Copied";
    b.classList.add("__bgOn");
    setTimeout(function () { tip.textContent = was; b.classList.remove("__bgOn"); }, 1200);
  }
