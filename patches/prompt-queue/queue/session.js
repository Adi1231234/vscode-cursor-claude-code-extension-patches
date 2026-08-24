  /* ---------- React fiber / session discovery ----------
     The walk itself lives in lib/js/ccStore.js (shared with background-tasks and
     prepended to this script); these are the two names the rest of the queue and
     the log probe already use. */
  function fiberOf(node) {
    return globalThis.__ccFiber(node);
  }

  function getSession() {
    return globalThis.__ccStore();
  }
