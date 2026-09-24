/* Shared webview runtime: the app's session state, as pushes instead of polls.

   The session store is a set of Preact signals - 97 of them in 2.1.280, busy,
   messages, sessionId, connection among them - and a signal carries
   .subscribe(). Everything a patch used to poll on a timer is already a push:
   the queue asked busy() every 150 ms and auto-followup every 300 ms, in every
   panel, whether anything had changed or not.

   The store is replaced when the conversation changes. What holds the current
   one is the app's 'sessions' object, a prop on the chain above the composer,
   whose 'activeSession' is itself a signal - so a conversation change is a push
   too, and every subscription below is moved to the new store when it fires.

   Nothing is resolvable before the app has rendered its composer, and this
   script runs before it does. So until the first resolve succeeds, it retries
   on DOM changes (lib/js/ccWatch.js) rather than on a timer, and stops
   listening the moment it has an answer.

   Callbacks run in a microtask, never inside the signal's own write: that is
   the app's update in progress, and a patch has no business doing DOM work in
   the middle of it. Each callback gets (value, store, initial): .subscribe()
   fires once straight away with the CURRENT value, and 'initial' says so, so an
   edge detector can prime on it instead of reading it as a change - opening a
   panel mid-run must not look like a run that just finished. */
window.__ccSession = window.__ccSession || (function () {
  var sessions = null, store = null, triedInput = null, stopWatch = null;
  var subs = [], onSwap = [];

  function isSig(v) {
    return !!(v && typeof v === "object" && "value" in v &&
              typeof v.subscribe === "function" && typeof v.peek === "function");
  }

  function later(fn) {
    Promise.resolve().then(function () { try { fn(); } catch (e) {} });
  }

  /* Up the fiber chain from the composer: the first props object holding a
     'sessions'-shaped value (one with an activeSession signal). */
  function findSessions() {
    var inp = window.__ccInput ? window.__ccInput() : null;
    if (!inp || inp === triedInput) return null;
    triedInput = inp;
    var f = window.__ccFiber ? window.__ccFiber(inp) : null, d = 0;
    while (f && d < 400) {
      var p = f.memoizedProps;
      if (p && typeof p === "object") {
        for (var k in p) {
          var v = p[k];
          if (v && typeof v === "object" && isSig(v.activeSession)) return v;
        }
      }
      f = f.return;
      d++;
    }
    return null;
  }

  function subscribe(sub) {
    if (sub.un) { try { sub.un(); } catch (e) {} sub.un = null; }
    var sig = store && store[sub.name];
    if (!isSig(sig)) return;
    var first = true, s = store;
    sub.un = sig.subscribe(function (v) {
      var initial = first;
      first = false;
      later(function () { sub.fn(v, s, initial); });
    });
  }

  function bind(next) {
    if (next === store) return;
    store = next || null;
    for (var i = 0; i < subs.length; i++) subscribe(subs[i]);
    for (var j = 0; j < onSwap.length; j++) (function (fn) { later(function () { fn(store); }); })(onSwap[j]);
  }

  /* Two ways in. The 'sessions' object is the exact one - a conversation
     change is its own push - and it is what 2.1.280 has. A bundle whose chain
     does not carry it still has the store itself (lib/js/ccStore.js finds it
     from the composer), and there a conversation change remounts the composer,
     which the DOM push reports: so until 'sessions' turns up, every DOM change
     re-asks __ccStore() - cached per composer element, so an unchanged panel
     costs one comparison - and binds whatever it returns. */
  function resolve() {
    if (sessions || window.IS_SESSION_LIST_ONLY) return;
    var found = findSessions();
    if (found) {
      sessions = found;
      if (stopWatch) { stopWatch(); stopWatch = null; }
      sessions.activeSession.subscribe(function (s) { bind(s); });
      return;
    }
    var s = window.__ccStore ? window.__ccStore() : null;
    if (s) bind(s);
  }

  function start() {
    resolve();
    if (!sessions && window.__ccWatch) stopWatch = window.__ccWatch.on(resolve);
  }

  /* fn(value, store, initial) on every change of store[name], and once with the
     current value whenever a store is bound. Returns an unsubscribe. */
  function on(name, fn) {
    var sub = { name: name, fn: fn, un: null };
    subs.push(sub);
    if (store) subscribe(sub);
    return function () {
      if (sub.un) { try { sub.un(); } catch (e) {} }
      var i = subs.indexOf(sub);
      if (i >= 0) subs.splice(i, 1);
    };
  }

  /* fn(store) whenever the panel moves to another conversation, and once for
     the first one. */
  function onStore(fn) {
    onSwap.push(fn);
    if (store) later(function () { fn(store); });
  }

  start();
  return { on: on, onStore: onStore, store: function () { return store; }, isSignal: isSig };
})();
