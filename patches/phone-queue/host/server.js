/* PHONEQUEUE host: the extension host's end of /queue.

   The prompt queue lives in the panel's webview, and /queue runs in the CLI
   (mod/hooks/register.js). Neither can reach the other, but both reach this
   host: it spawned the CLI, and it carries every panel's messages. So the CLI
   POSTs the command here, over 127.0.0.1 (listen.js), and this posts it to the
   panel that spawned that CLI (panels.js). Both are written just above this.

   Spawn-time wiring, read by spawnClaude through args() / env(webview):
     --plugin-dir          the mod, copied beside extension.js by patch.ps1
     CC_PHONE_QUEUE_URL    this server, with a random path as its key
     CC_PHONE_QUEUE_PANEL  a token for the webview of the panel spawning it
   Both keys are always set, empty when there is nothing to give, and they go
   in last: a CLI inherits the environment of whatever started the editor, and
   an editor started from a CLI in a patched panel would otherwise hand its
   CLIs the parent window's address.

   One server per extension host, i.e. per editor window, which is also the
   scope of the CLIs it spawned. */
globalThis.__ccPhone = globalThis.__ccPhone || (function () {
    var fs = require("fs");
    var path = require("path");
    var CH = "__ccphone";
    var REPLY_MS = 5000;
    var panels = ccPhonePanels(CH, REPLY_MS);
    var listener = ccPhoneListen(panels.ask);

    /* The panel's messages: its answers, from the webview they came from. */
    function handle(msg, from) {
        if (!msg || msg.type !== CH) return false;
        try {
            if (msg.op === "result") panels.answer(msg, from);
        } catch (e) {}
        return true;
    }

    /* The CLI's environment, for the panel whose webview is spawning it. */
    function env(wv) {
        var url = listener.url();
        var mine = url && wv && typeof wv.postMessage === "function";
        return { CC_PHONE_QUEUE_URL: url, CC_PHONE_QUEUE_PANEL: mine ? panels.token(wv) : "" };
    }

    var modDir = path.join(__dirname, "__MODDIR__");

    return {
        handle: handle,
        ready: listener.ready.then(function (url) { return !!url; }),
        args: function () { return fs.existsSync(modDir) ? { "plugin-dir": modDir } : {}; },
        env: env
    };
})();
