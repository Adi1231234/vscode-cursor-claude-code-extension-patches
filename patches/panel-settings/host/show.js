/* Raising one Windows toast, and where clicking it should take you.

   Split from notify.js so that one module decides whether a finish is worth
   announcing and this one only knows how to announce it.

   The toast is raised by host/toast.ps1, base64'd into B64 at patch time and
   handed to powershell with -EncodedCommand. Two reasons: PowerShell is the
   only way to reach WinRT from here without a native module, and an encoded
   command has no quoting to get wrong. Nothing dynamic is ever put on the
   command line - every value travels in the environment. */
globalThis.__ccToastShow = globalThis.__ccToastShow || (function () {
    var cp = require("child_process");

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

    /* Where clicking the toast should take you: this window.

       Windows will not let a background process raise a window -
       SetForegroundWindow returns false when the caller did not receive the
       last input - so the click has to run through something the shell itself
       launches. Three routes were measured; only one costs nothing.

       The editor's OWN uri (scheme://file/<folder>/) does focus the right
       window, but every file: uri from an external app first raises "An
       external application wants to open ..." - that is shouldBlockOpenable,
       and the only way to silence it is the user's own
       security.promptForLocalFileProtocolHandling setting. A patch has no
       business editing settings.json.

       A custom scheme in the registry is what every recipe on the web does,
       and every one of them points it at a .cmd or a powershell, which FLASH
       A CONSOLE. (The in-process route is worse: the BurntToast author's own
       write-up says PowerShell cannot subscribe to a toast's WinRT events
       before 7.1, and these toasts run on 5.1.)

       What is left has neither cost. The editor's COMMAND LINE takes a folder
       and focuses the window already holding it - shouldBlockOpenable lives in
       handleProtocolUrl and the CLI never goes near it, so there is no prompt -
       and the editor is a windowed app, so there is no console either. The
       click reaches it through a shortcut carrying the folder as its argument,
       so nothing has to parse anything at click time. toast.ps1 writes that
       shortcut; this just says where to point it.

       Measured with five windows open and the setting REMOVED: clicking the
       toast moved the foreground to the right window, nothing else opened, and
       no prompt appeared. */
    function focusTarget() {
        try {
            var vscode = require("vscode");
            var folders = vscode.workspace.workspaceFolders;
            if (!folders || !folders.length) return null;
            return { folder: String(folders[0].uri.fsPath), exe: process.execPath };
        } catch (e) {
            return null;
        }
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
        var target = focusTarget();
        var env = Object.assign({}, process.env, {
            CC_TOAST_APPID: editorAppId(),
            CC_TOAST_TITLE: String(title || ""),
            CC_TOAST_BODY: String(body || ""),
            CC_TOAST_FOLDER: target ? target.folder : "",
            CC_TOAST_EXE: target ? target.exe : ""
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

    return toast;
})();
