/* The host half of "tell me when the run finished": it decides whether one
   message from the panel becomes a Windows toast, hands it to host/show.js if
   it does, and tells the panel which of the two it did.

   Why the host at all - the panel is a Chromium renderer and cannot reach the
   Action Center, and the app's own show_notification RPC (which does exist, and
   which the webview already calls elsewhere) ends at
   vscode.window.showInformationMessage: an in-editor toast, drawn inside the
   window you are not looking at. The whole point of this feature is to be seen
   while the editor is behind something else, so it has to leave the editor. */
globalThis.__ccNotify = globalThis.__ccNotify || (function () {
    var CH = "__ccnotify";

    /* "Is the window Claude works from the focused one?" There is exactly one
       extension host per editor window, and this is that window's, so
       vscode.window.state.focused is the question asked and nothing has to be
       matched up by hand. The panel cannot answer it: it is an out-of-process
       iframe, and document.hasFocus() is about the panel, not the window - it
       is false whenever the cursor is in the editor beside it.

       Unreadable means not focused, so the toast still fires: a notification
       you did not need is a smaller failure than a silence you were relying
       on. */
    function windowFocused() {
        try {
            return require("vscode").window.state.focused === true;
        } catch (e) {
            return false;
        }
    }

    /* The panel asked, so the panel is told. Everything this module decides is
       invisible from the other side - the gate's whole job is that nothing
       happens - and a panel that cannot tell "the host stayed quiet on purpose"
       from "the host never got it" has no way to explain a toast it did not
       expect, or a silence it did. The same reply doubles as the answer to the
       ping below. */
    function post(wv, msg) {
        try {
            if (!wv || typeof wv.postMessage !== "function") return;
            var sent = wv.postMessage(msg);
            if (sent && typeof sent.then === "function") sent.then(function () {}, function () {});
        } catch (e) {}
    }

    function handle(msg, wv) {
        if (!msg || msg.type !== CH) return false;
        try {
            /* "Does the host behind this panel apply the gates at all?" This
               host answers; one from before the gates existed swallows the
               message and answers nothing, which is exactly what the panel
               tests for. The two halves of this patch load at different times -
               webview/index.js when a panel opens, extension.js once when the
               window's extension host starts - so a window that has been open
               since before an apply.ps1 run really can show a toggle its own
               host has never heard of. Feature detection, not a version
               compare: what matters is whether this code is behind the panel,
               not which build it came from. */
            if (msg.op === "ping") {
                post(wv, { type: CH, op: "pong" });
                return true;
            }
            if (msg.op === "done") {
                var focused = windowFocused();
                var shown = !(msg.skipWhenFocused && focused);
                if (shown) globalThis.__ccToastShow(msg.title, msg.body);
                post(wv, { type: CH, op: "decided", shown: shown, focused: focused });
            }
        } catch (e) {}
        return true;
    }

    return { handle: handle };
})();
