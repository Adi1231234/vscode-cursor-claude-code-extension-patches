/* One conversation's session store, for a page whose React state we cannot see.

   The webview patches read a conversation off the app's own store - Preact
   signals found from the composer (lib/js/ccStore.js). Our desktop code runs
   in the preload's isolated world: same DOM, none of the page's JS objects. So
   this builds a store of the same shape from what the isolated world does see,
   and the queue and the shared runtimes run on it unchanged:
     sessionId   the app's id for the conversation (local_<uuid>)
     busy        a signal: a run is going. From the app's own session record
                 (isRunning, through the event stream) and, while the
                 conversation is on screen, also the composer's Stop button,
                 which the app shows the moment it takes a message. Either one
                 holds it busy, so it falls only when the whole run is over
     messages    a signal: the rows seen since the page opened (rows.js)
     processIncomingMessage(frame)  called for every frame, before the rows
                 change - the method the queue decorates to read
                 rate_limit_event and result
     interrupt() called on a press of the Stop button, before the app sees it
     send(text)  only while the conversation is NOT on screen: the app's own
                 LocalSessions.sendMessage. On screen the queue types into the
                 composer, as the person would. */
window.__ccdStore = window.__ccdStore || (function () {
    var LIMIT = 600, TRIM = 100;   /* the store's own bound on its list */

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

    /* Attachments are typed into the composer, which only the conversation on
       screen has; such an item waits there (the queue retries it). */
    function sendOffScreen(s, text, files) {
        if (files && files.length) return Promise.reject(new Error("attachments are sent once the conversation is on screen"));
        return window.__ccdIpc.invoke("sendMessage", s.sessionId, text).then(function () {
            s.running = true;   /* until the app says otherwise: never two sends in one gap */
            s.refresh();
        });
    }

    function make(id) {
        var s = {
            sessionId: id,
            busy: sig(false),
            messages: sig([]),
            running: window.__ccdIpc.ready,   /* unknown until the app answers: held */
            stopShown: false,
            processIncomingMessage: function () {},
            interrupt: function () {},
            refresh: function () { s.busy.value = !!(s.running || s.stopShown); },
            /* Whether the conversation is on screen decides how it sends. */
            setOnScreen: function (on) {
                if (on) delete s.send;
                else s.send = function (text, files) { return sendOffScreen(s, text, files); };
            },
            frame: function (frame) {
                try { s.processIncomingMessage(frame); } catch (e) {}
                var row = window.__ccdRow(frame);
                if (!row) return;
                var list = s.messages.peek().concat([row]);
                if (list.length > LIMIT) list = list.slice(TRIM);
                s.messages.value = list;
            }
        };
        s.setOnScreen(false);
        s.refresh();
        if (window.__ccdIpc.ready) {
            window.__ccdIpc.invoke("getSession", id).then(function (rec) {
                s.running = !!(rec && rec.isRunning);
                s.refresh();
            }, function () { s.running = false; s.refresh(); });
        }
        return s;
    }

    return { make: make };
})();
