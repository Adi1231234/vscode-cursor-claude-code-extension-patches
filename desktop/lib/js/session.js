/* The session store, for a page whose React state we cannot see.

   The webview patches read the conversation off the app's own store - a set of
   Preact signals found from the composer (lib/js/ccStore.js) and followed
   across conversations (lib/js/ccSession.js). Our desktop code runs in the
   preload's isolated world: same DOM, none of the page's JS objects. So this
   builds a store with the same shape out of what the isolated world does see,
   and the queue and the shared runtimes run on it unchanged:
     sessionId   the conversation in the address (/code/<id>)
     busy        a signal: the composer shows Stop. It stays Stop through every
                 subagent and tool call, so one rise and fall is one whole run
     messages    a signal: the rows of this conversation seen since the page
                 opened, from the app's event stream (ipc.js, rows.js)
     processIncomingMessage(frame)  called for every frame of it, before the
                 rows change - the method the queue decorates to read
                 rate_limit_event and result
     interrupt() called on a press of the Stop button, before the app sees it
   One store per conversation, kept while the page lives, so going back to a
   conversation finds its rows. The stores are handed to lib/js/ccSession.js
   through __ccSessionSource, which binds whichever one is on screen. */
(function () {
    if (window.__ccSessionSource) return;
    var LIMIT = 600, TRIM = 100;   /* the store's own bound on its list */
    var stores = {}, current = null, bindFn = null;

    function input() { return document.querySelector('[data-testid="code-prompt-input"]'); }
    function stopShown() { return !!document.querySelector('[data-testid="code-prompt-stop"]'); }

    function sig(v) {
        var subs = [];
        return {
            get value() { return v; },
            set value(n) {
                if (n === v) return;
                v = n;
                subs.slice().forEach(function (f) { try { f(v); } catch (e) {} });
            },
            peek: function () { return v; },
            subscribe: function (fn) {
                subs.push(fn);
                try { fn(v); } catch (e) {}
                return function () { var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); };
            }
        };
    }

    function sessionIdFromUrl() {
        var m = location.pathname.match(/\/(?:code|epitaxy)\/((?:local|session|cse)_[A-Za-z0-9-]+)/);
        return m ? m[1] : null;
    }

    function storeFor(id) {
        if (!stores[id]) {
            stores[id] = {
                sessionId: id,
                busy: sig(false),
                messages: sig([]),
                processIncomingMessage: function () {},
                interrupt: function () {}
            };
        }
        return stores[id];
    }

    function onFrame(ev) {
        if (!ev || ev.type !== "message" || !ev.message || !stores[ev.sessionId]) return;
        var s = stores[ev.sessionId];
        try { s.processIncomingMessage(ev.message); } catch (e) {}
        var row = window.__ccdRow(ev.message);
        if (!row) return;
        var list = s.messages.peek().concat([row]);
        if (list.length > LIMIT) list = list.slice(TRIM);
        s.messages.value = list;
    }

    /* The conversation on screen, and whether it is running, re-read on every
       DOM change the app makes - a route change re-renders the page. */
    function sync() {
        var id = sessionIdFromUrl();
        var next = id ? storeFor(id) : null;
        if (next) next.busy.value = stopShown();
        if (next !== current) {
            current = next;
            if (bindFn) bindFn(current);
        }
    }

    /* The Stop button pressed: the store's interrupt() runs first, as the
       webview's does when its own Stop is clicked. */
    function onClick(ev) {
        var t = ev.target;
        if (current && t && t.closest && t.closest('[data-testid="code-prompt-stop"]')) {
            try { current.interrupt(); } catch (e) {}
        }
    }

    window.__ccInput = window.__ccInput || input;
    window.__ccFiber = window.__ccFiber || function () { return null; };
    window.__ccStore = window.__ccStore || function () { sync(); return current; };
    window.__ccSessionSource = function (bind) {
        bindFn = bind;
        if (current) bind(current);
    };

    window.__ccd.patch("session-store", function () {
        window.__ccdIpc.on(onFrame);
        document.addEventListener("click", onClick, true);
        window.addEventListener("popstate", sync);
        window.__ccWatch.on(sync);
        sync();
    });
})();
