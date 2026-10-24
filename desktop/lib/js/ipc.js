/* The app's own event stream for local Code sessions, as a push.

   Our renderer payload sits at the top of the Code tab's preload (mainView.js),
   the very file that hands the main process's session events to the page: it
   listens on "<prefix>LocalSessions_$_onEvent" and forwards each event, as is,
   to the page's onOnEvent. Every event names its session ({type, sessionId,
   ...}); a "message" event carries one frame of that session's CLI output in
   `message` - the same stream-json frames the VS Code panel's store reads:
   user and assistant rows, `result`, `rate_limit_event`. So the facts the
   webview queue reads off its store (was this run stopped, refused by a usage
   limit, answered at all) come here from the same frames, with no DOM guessing.

   The channel prefix carries a per-build uuid, so the build reads it out of the
   archive's own mainView.js and fills __CCD_WEB_CHANNEL__ in
   (desktop/tools/build-renderer.cjs). A build that could not find it leaves the
   token as is, and then nothing is wired: `ready` is false and every reader
   keeps its DOM-only behaviour. Adding a listener never changes what the page
   receives. */
window.__ccdIpc = window.__ccdIpc || (function () {
    var PREFIX = "__CCD_WEB_CHANNEL__";
    var subs = [];
    var ipc = null;

    if (PREFIX.indexOf("__CCD") !== 0) {
        try { ipc = require("electron").ipcRenderer; } catch (e) { ipc = null; }
    }

    function deliver(_sender, ev) {
        if (!ev || typeof ev !== "object") return;
        for (var i = 0; i < subs.length; i++) {
            try { subs[i](ev); } catch (e) { /* one reader never stops the rest */ }
        }
    }

    if (ipc) ipc.on(PREFIX + "LocalSessions_$_onEvent", deliver);

    /* fn(event) for every local-session event; returns an unsubscribe. */
    function on(fn) {
        subs.push(fn);
        return function () {
            var i = subs.indexOf(fn);
            if (i >= 0) subs.splice(i, 1);
        };
    }

    return { ready: !!ipc, on: on };
})();
