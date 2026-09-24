  /* ---------- Init ---------- */
  hookFileReader();
  document.addEventListener("keydown", onComposerKeydown, true);
  /* Ctrl+Alt+L opens the log viewer on demand (the button itself is hidden). */
  document.addEventListener("keydown", function (ev) {
    if (ev.ctrlKey && ev.altKey && (ev.key === "l" || ev.key === "L")) { ev.preventDefault(); ev.stopPropagation(); openLogModal(); }
  }, true);
  try {
    window.__ccLogs = function () { return _ccLogs.slice(); };            /* read logs programmatically */
    window.__ccLogBtn = function () { window.__ccLogBtnOn = 1; schedulePass(); return "queue log button enabled"; };
    window.__ccLog = ccLog;   /* any patch can trace under its own tag, not __qAuto.log's */
  } catch (e) {}
  ensureAddButton();
  /* No timer: drive.js runs the pass on pushes. */
  wireQueue();
})();</script>
