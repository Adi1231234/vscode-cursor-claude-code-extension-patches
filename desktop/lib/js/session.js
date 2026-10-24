/* Every conversation's store (store.js), and which one is on screen.

   The app shows one conversation at a time, at /code/<id>; the "New session"
   page has no id until its first message. One store per conversation, kept
   while the page lives, fed from the app's event stream (ipc.js) whether the
   conversation is on screen or not:
     - a "message" event is one CLI frame of that conversation;
     - every event carrying the app's session record says whether a run is
       going (isRunning); "stopped" says it is not.
   For the one on screen the Stop button counts too, re-read on every DOM
   change the app makes (a route change re-renders the page).

   __ccdSessions is what the desktop queue builds on: the store of any
   conversation, the one on screen, a push when that changes, and which
   conversation a CLI session id belongs to. The window-level __ccStore /
   __ccInput / __ccSessionSource are the same facts for webview code that
   reads one panel's store. */
(function () {
    if (window.__ccdSessions) return;
    var stores = {}, currentId = null, started = false;
    var watchers = [], bindFn = null;

    /* The app names a conversation local_<uuid>; the CLI behind it has its own
       session id, on every frame (session_id) and every transcript row
       (sessionId). A /queue from the phone carries the CLI's. */
    var cliToLocal = {};

    function stopShown() { return !!document.querySelector('[data-testid="code-prompt-stop"]'); }

    function idFromUrl() {
        var m = location.pathname.match(/\/(?:code|epitaxy)\/((?:local|session|cse)_[A-Za-z0-9-]+)/);
        return m ? m[1] : null;
    }

    function storeOf(id) {
        if (!id) return null;
        if (!stores[id]) stores[id] = window.__ccdStore.make(id);
        return stores[id];
    }

    function noteCliIds(ev) {
        var rows = ev.type === "message" ? [ev.message] : ev.type === "transcript_loaded" ? ev.messages : null;
        for (var i = 0; rows && i < rows.length; i++) {
            var id = rows[i] && (rows[i].session_id || rows[i].sessionId);
            if (typeof id === "string" && id) cliToLocal[id] = ev.sessionId;
        }
    }

    function onEvent(ev) {
        if (!ev || typeof ev.sessionId !== "string" || !ev.sessionId) return;
        noteCliIds(ev);
        var s = stores[ev.sessionId];
        if (!s) return;
        if (ev.session && typeof ev.session.isRunning === "boolean") { s.running = ev.session.isRunning; s.refresh(); }
        else if (ev.type === "stopped") { s.running = false; s.refresh(); }
        if (ev.type === "message" && ev.message) s.frame(ev.message);
    }

    /* The conversation on screen, and its Stop button. */
    function sync() {
        var id = idFromUrl(), s = storeOf(id);
        if (s) { s.stopShown = stopShown(); s.refresh(); }
        if (id === currentId) return;
        var was = stores[currentId];
        if (was) { was.stopShown = false; was.setOnScreen(false); was.refresh(); }
        if (s) s.setOnScreen(true);
        var prev = currentId;
        currentId = id;
        if (bindFn) bindFn(s);
        watchers.slice().forEach(function (fn) { try { fn(id, prev); } catch (e) {} });
    }

    function onClick(ev) {
        var t = ev.target, s = stores[currentId];
        if (s && t && t.closest && t.closest('[data-testid="code-prompt-stop"]')) {
            try { s.interrupt(); } catch (e) {}
        }
    }

    window.__ccdSessions = {
        store: storeOf,
        current: function () { if (started) sync(); return currentId; },
        /* fn(id, previousId) whenever another conversation comes on screen. */
        onCurrent: function (fn) { watchers.push(fn); },
        localOf: function (cliSid) { return cliToLocal[cliSid] || null; }
    };
    window.__ccInput = window.__ccInput || function () { return document.querySelector('[data-testid="code-prompt-input"]'); };
    window.__ccFiber = window.__ccFiber || function () { return null; };
    window.__ccStore = window.__ccStore || function () { if (started) sync(); return stores[currentId] || null; };
    window.__ccSessionSource = function (bind) { bindFn = bind; if (stores[currentId]) bind(stores[currentId]); };

    window.__ccd.patch("session-store", function () {
        started = true;
        window.__ccdIpc.on(onEvent);
        document.addEventListener("click", onClick, true);
        window.addEventListener("popstate", sync);
        window.__ccWatch.on(sync);
        sync();
    });
})();
