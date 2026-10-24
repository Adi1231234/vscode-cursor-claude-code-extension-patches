  /* ---------- The surface, desktop: which conversation this queue is ----------
     The editor runs one queue per panel; the app shows one conversation at a
     time, so it runs one queue per conversation (engines.js) and each is built
     with a host:
       host.store()     the conversation's store (desktop/lib/js/store.js),
                        null on the "New session" page until it has an id
       host.onScreen()  whether its conversation is the one shown
       host.source      binds the store into this queue's own session pushes
       host.publish()   where it hands out __qRemote / __qAuto
     A queue off screen has no composer: it draws nothing and sends through
     its store (store.send); the one on screen draws and types. */
  var STOP = '[data-testid="code-prompt-stop"]';
  var _push = null;

  function composerEl() {
    return host.onScreen() ? document.querySelector('[data-testid="code-prompt-input"]') : null;
  }

  function sessionStore() {
    return host.store();
  }

  /* Built on first use: lib/js/ccSession.js comes later in the fragment list. */
  function sessionPush() {
    return _push || (_push = window.__ccSessionMake(host.source));
  }

  function expose(name, api) {
    return host.publish(name, api);
  }

  /* Only for a queue with no store (the "New session" page), and only there. */
  function composerBusy() {
    return host.onScreen() && !!qs(STOP);
  }
