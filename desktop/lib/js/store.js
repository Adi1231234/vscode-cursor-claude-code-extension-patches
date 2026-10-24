/* One conversation's session store, for a page whose React state we cannot see.

   The webview patches read a conversation off the app's own store - Preact
   signals found from the composer (lib/js/ccStore.js). Our desktop code runs
   in the preload's isolated world: same DOM, none of the page's JS objects. So
   this builds a store of the same shape from what the isolated world does see,
   and the queue and the shared runtimes run on it unchanged. There are two
   kinds of conversation, and the frames reach us two ways:
     - one the app runs itself (local_<uuid>): its frames are on the app's own
       event stream (ipc.js), and its run state is the app's session record
       (isRunning); it can be sent to off screen (LocalSessions.sendMessage).
     - one run elsewhere, over Remote Control (session_/cse_<uuid>, a CLI in
       Adi Tools, the phone, another machine): its frames are NOT on that
       stream. The page reads them from a WebSocket per conversation, and so
       does remote-sub.js, from this isolated world - the same frames. It has
       no off-screen send path here, so its queue sends through the composer
       while it is on screen.
   The fields the queue reads, filled from whichever source:
     sessionId   the app's id for the conversation
     busy        a signal: a run is going. From the Stop button the app shows
                 while a conversation is on screen (the moment it takes a
                 message until the whole run is over) and, for a local
                 conversation, its isRunning too
     messages    a signal: the rows seen since the page opened (rows.js)
     processIncomingMessage(frame)  called for every frame, before the rows
                 change - the method the queue decorates to read
                 rate_limit_event and result
     interrupt() called on a press of the Stop button, before the app sees it
     send(text)  only while the conversation is NOT on screen, and only for a
                 local one. On screen the queue types into the composer. */
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

    /* Off screen, a conversation the app runs itself is sent through the app's
       own LocalSessions.sendMessage; a Remote Control conversation (its CLI
       elsewhere) has no such path here, so its item waits until it is on
       screen and goes through the composer. Attachments always wait - they go
       through the composer. */
    function sendOffScreen(s, text, files) {
        if (window.__ccdRemote.isRemote(s.sessionId)) return Promise.reject(new Error("a Remote Control conversation sends once it is on screen"));
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
        var remote = window.__ccdRemote.isRemote(id);
        s.setOnScreen(false);
        s.refresh();
        if (remote) {
            /* Its frames come on its own subscription (remote-sub.js), on screen
               or not, so stop / usage-limit / replies are read the same way. */
            s.running = false; s.refresh();
            s.stopSub = window.__ccdRemote.subscribe(id, s.frame);
        } else if (window.__ccdIpc.ready) {
            window.__ccdIpc.invoke("getSession", id).then(function (rec) {
                s.running = !!(rec && rec.isRunning);
                s.refresh();
            }, function () { s.running = false; s.refresh(); });
        }
        return s;
    }

    return { make: make };
})();
