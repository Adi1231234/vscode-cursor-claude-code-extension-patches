/* The host half of "tell me when the run finished": it decides whether one
   message from the panel becomes a Windows toast, and hands it to host/show.js
   if it does.

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

    function handle(msg) {
        if (!msg || msg.type !== CH) return false;
        try {
            if (msg.op === "done") {
                if (msg.skipWhenFocused && windowFocused()) return true;
                globalThis.__ccToastShow(msg.title, msg.body);
            }
        } catch (e) {}
        return true;
    }

    return { handle: handle };
})();
