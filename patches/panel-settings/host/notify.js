/* The host half of "tell me when the run finished": it turns one message from
   the panel into one Windows toast.

   Why the host at all - the panel is a Chromium renderer and cannot reach the
   Action Center, and the app's own show_notification RPC (which does exist, and
   which the webview already calls elsewhere) ends at
   vscode.window.showInformationMessage: an in-editor toast, drawn inside the
   window you are not looking at. The whole point of this feature is to be seen
   while the editor is behind something else, so it has to leave the editor.

   The toast itself is raised by host/toast.ps1, base64'd into B64 at patch time
   and handed to powershell with -EncodedCommand. Two reasons: PowerShell is the
   only way to reach WinRT from here without a native module, and an encoded
   command has no quoting to get wrong. Nothing dynamic is ever put in the
   command line - the title and body travel in the environment. */
globalThis.__ccNotify = globalThis.__ccNotify || (function () {
    var cp = require("child_process");

    var CH = "__ccnotify";
    var B64 = "__TOAST_B64__";
    var KILL_MS = 15000;

    var appId;

    /* The running editor's AppUserModelID, so the toast wears that editor's name
       and icon rather than PowerShell's. Both editors publish it in the
       product.json beside their app root (Microsoft.VisualStudioCode /
       Anysphere.Cursor), which is how this stays editor-agnostic: the value is
       read from whichever editor is running, never branched on. Resolved once;
       "" is a valid answer and means the script falls back on its own. */
    function editorAppId() {
        if (appId !== undefined) return appId;
        appId = "";
        try {
            var vscode = require("vscode");
            var fs = require("fs");
            var path = require("path");
            var product = JSON.parse(fs.readFileSync(path.join(vscode.env.appRoot, "product.json"), "utf8"));
            if (product && typeof product.win32AppUserModelId === "string") appId = product.win32AppUserModelId;
        } catch (e) {}
        return appId;
    }

    /* Everywhere that is not Windows gets the editor's own notification rather
       than nothing, so the toggle still does something recognisable there. */
    function inEditor(title, body) {
        try {
            require("vscode").window.showInformationMessage(body ? title + " - " + body : title);
        } catch (e) {}
    }

    function toast(title, body) {
        if (process.platform !== "win32") return inEditor(title, body);
        var env = Object.assign({}, process.env, {
            CC_TOAST_APPID: editorAppId(),
            CC_TOAST_TITLE: String(title || ""),
            CC_TOAST_BODY: String(body || "")
        });
        var child;
        try {
            child = cp.spawn("powershell.exe",
                ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", B64],
                { env: env, windowsHide: true, stdio: "ignore" });
        } catch (e) {
            return;
        }
        /* Nothing is read back, but an unhandled "error" event on a child is a
           throw, and this runs inside the app's own message listener. */
        child.on("error", function () {});
        var timer = setTimeout(function () {
            try { child.kill(); } catch (e) {}
        }, KILL_MS);
        if (timer.unref) timer.unref();
        child.on("close", function () { clearTimeout(timer); });
    }

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
                toast(msg.title, msg.body);
            }
        } catch (e) {}
        return true;
    }

    return { handle: handle };
})();
