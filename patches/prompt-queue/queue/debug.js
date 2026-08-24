  /* ---------- Console diagnostic ----------
     Its own fragment because it is its own concern: nothing else here depends on
     it, and keeping it in persist.js pushed that file one line over the 150-line
     limit (the lab's self-test is what noticed). */

  /* __ccqDebug() reports whether a session id is being resolved and which queue
     keys exist in localStorage. */
  try {
    window.__ccqDebug = function () {
      return { curSid: _curSid, found: getSessionId(), keys: Object.keys(localStorage).filter(function (k) { return k.indexOf("ccq:") === 0; }) };
    };
  } catch (e) {}

