  /* ---------- React fiber / session discovery ----------
     The walk itself lives in lib/js/ccStore.js (shared with auto-followup and
     prepended to this script); these are the two names the rest of the queue and
     the log probe already use. */
  function fiberOf(node) {
    return globalThis.__ccFiber(node);
  }

  function getSession() {
    return globalThis.__ccStore();
  }

  /* Run fn(args) just before one of the session store's own methods, once per
     store object (marked with flag, since the object is replaced when the
     conversation changes and the caller re-runs this on every pass). The app's
     call is never altered: an own property shadows the prototype and returns
     what the original returns. Answers true when it decorated just now. */
  function decorateSession(method, flag, fn) {
    var s = getSession();
    if (!s || s[flag] || typeof s[method] !== "function") return false;
    var orig = s[method];
    s[method] = function () {
      try { fn.apply(this, arguments); } catch (e) {}
      return orig.apply(this, arguments);
    };
    s[flag] = 1;
    return true;
  }
