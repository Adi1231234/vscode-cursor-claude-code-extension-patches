  /* ---------- Shared modal chrome (overlay, head, foot, Esc, focus) ----------
     Three dialogs live in this panel - the schedule modal, the log viewer and
     the saved-queues manager - and each one needs the same overlay, head, foot,
     Esc, backdrop and focus trap. That used to be written out here; it moved to
     lib/js/ccModal.js when the settings dialog became the fourth caller, and
     comes back into this bundle through order.json.

     Same function, same returned shape, same __q* class names - the move was a
     move, not a rewrite. */
  var openShell = window.__ccModal;
