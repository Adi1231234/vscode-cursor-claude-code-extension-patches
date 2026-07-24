  /* ---------- Add-to-queue button (beside the app's send button) ----------
     A quiet ghost button sitting just left of the primary send button, so
     "queue" never competes with "send" for attention. Re-anchored on every
     tick because the app re-renders (React) its own footer children. */
  var ADD_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h12"></path><path d="M4 12h12"></path><path d="M4 17h7"></path><path d="M17.5 14v7"></path><path d="M14 17.5h7"></path></svg>';
  /* Styled tooltip mirroring the app's own mic-button tooltip (shortcut chip). */
  var TIP_HTML = '<span class="__qTip" aria-hidden="true">Add to queue<span class="__qKbd">Alt+Enter</span></span>';

  function onAddClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    var e = inp();
    if (!e) return;
    if (commitComposerToQueue(ev, e, true)) e.focus();
  }

  var LOG_ICON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"></rect><line x1="8" y1="8" x2="16" y2="8"></line><line x1="8" y1="12" x2="16" y2="12"></line><line x1="8" y1="16" x2="13" y2="16"></line></svg>';

  function ensureAddButton() {
    var e = inp();
    if (!e) return;
    var form = e.closest("form");
    if (!form) return;
    var send = form.querySelector('[class*="sendButton"]');
    if (!send || !send.parentNode) return;
    var b = form.querySelector(".__qAdd");
    if (!b) {
      b = btn("__qAdd");                                       /* no native title - styled tooltip instead */
      b.setAttribute("aria-label", "Add to queue (Alt+Enter)");
      b.innerHTML = ADD_ICON + TIP_HTML;
      b.addEventListener("click", onAddClick);
    }
    /* insertBefore an already-attached node just moves it: idempotent, never duplicates */
    if (send.previousElementSibling !== b) send.parentNode.insertBefore(b, send);
    /* The log-viewer button is OFF by default; window.__ccLogBtn() (or Ctrl+Alt+L)
       shows it / opens the log modal when we need to debug. */
    if (window.__ccLogBtnOn) ensureLogButton(form, send, b);
  }

  function ensureLogButton(form, send, b) {
    var lg = form.querySelector(".__qLog");
    if (!lg) {
      lg = btn("__qLog", "Queue logs (Ctrl+Alt+L)");   /* distinct class - must NOT match the .__qAdd query */
      lg.innerHTML = LOG_ICON;
      lg.addEventListener("click", function (ev) { ev.preventDefault(); ev.stopPropagation(); openLogModal(); });
    }
    if (b.previousElementSibling !== lg) send.parentNode.insertBefore(lg, b);
  }

