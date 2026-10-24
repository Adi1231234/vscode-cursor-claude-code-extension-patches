/* PHONEQUEUE desktop, main process: give every CLI the app starts the /queue
   mod and the address of the listener (patches/phone-queue/host/listen.js).

   The editor passes both at the CLI's spawn. Here no spawn site is touched:
   CLAUDE_CODE_PLUGIN_DIRS is the documented way to load a plugin folder "where
   no flag can be given (a session the desktop app or an SDK host starts)",
   read from the process environment - and every local session the app starts
   inherits the app's. So both go into the main process's environment once, at
   startup, before any session is started:
     CLAUDE_CODE_PLUGIN_DIRS  + the mod folder apply.ps1 copied it to
     CC_PHONE_QUEUE_URL       this listener (set the moment it listens)
     CC_PHONE_QUEUE_PANEL     "" - the app routes by conversation, not by panel
   Nothing is wired when the mod folder is missing: a /queue with no mod is
   just an unknown command, and a mod with no listener would answer nothing. */
(function () {
    if (typeof process === "undefined" || process.type !== "browser") return;
    var path = require("path");
    var fs = require("fs");
    var dir = path.join(process.env.LOCALAPPDATA || "", "claude-code-patches", "mods", "queue");
    if (!process.env.LOCALAPPDATA || !fs.existsSync(path.join(dir, ".claude-plugin", "plugin.json"))) return;

    var listener = ccPhoneListen(ccdPhoneRouter().ask);
    var dirs = (process.env.CLAUDE_CODE_PLUGIN_DIRS || "").split(path.delimiter).filter(Boolean);
    if (dirs.indexOf(dir) < 0) dirs.push(dir);
    process.env.CLAUDE_CODE_PLUGIN_DIRS = dirs.join(path.delimiter);
    process.env.CC_PHONE_QUEUE_PANEL = "";
    process.env.CC_PHONE_QUEUE_URL = "";
    listener.ready.then(function (url) { process.env.CC_PHONE_QUEUE_URL = url; });
})();
