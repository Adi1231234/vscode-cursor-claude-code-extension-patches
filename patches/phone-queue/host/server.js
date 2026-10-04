/* PHONEQUEUE host: the extension host's end of /queue.

   The prompt queue lives in the panel's webview, and /queue runs in the CLI
   (mod/hooks/register.js). Neither can reach the other, but both reach this
   host: it spawned the CLI, and it carries every panel's messages. So the CLI
   POSTs the command here, over 127.0.0.1, and this posts it to the panel that
   spawned that CLI (panels.js, written just above this).

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
    var http = require("http");
    var crypto = require("crypto");
    var fs = require("fs");
    var path = require("path");
    var CH = "__ccphone";
    var REPLY_MS = 5000;
    var BODY_MAX = 65536;
    var panels = ccPhonePanels(CH, REPLY_MS);
    var key = "/" + crypto.randomBytes(18).toString("hex");
    var url = "";

    function reply(res, code, body) {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
    }

    function serve(req, res) {
        if (req.method !== "POST" || req.url !== key) {
            res.writeHead(404);
            res.end();
            return;
        }
        var body = "", over = false;
        req.setEncoding("utf8");
        req.on("data", function (chunk) {
            if (body.length + chunk.length > BODY_MAX) over = true;
            if (!over) body += chunk;
        });
        req.on("end", function () {
            if (over) { reply(res, 413, { error: "the command is too long" }); return; }
            var msg = null;
            try { msg = JSON.parse(body); } catch (e) {}
            if (!msg || typeof msg.sid !== "string" || !msg.cmd || typeof msg.cmd !== "object") {
                reply(res, 200, { error: "not a /queue request" });
                return;
            }
            panels.ask(String(msg.panel || ""), msg.sid, msg.cmd).then(function (out) { reply(res, 200, out); });
        });
    }

    /* Listening is a few ms after load and a CLI is spawned seconds later, when a
       panel opens; ready settles either way, so nothing has to wait on a timer. */
    var server = http.createServer(serve);
    var ready = new Promise(function (resolve) {
        server.on("error", function () { url = ""; resolve(false); });
        server.listen(0, "127.0.0.1", function () {
            url = "http://127.0.0.1:" + server.address().port + key;
            resolve(true);
        });
    });
    server.unref();

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
        var mine = url && wv && typeof wv.postMessage === "function";
        return { CC_PHONE_QUEUE_URL: url, CC_PHONE_QUEUE_PANEL: mine ? panels.token(wv) : "" };
    }

    var modDir = path.join(__dirname, "__MODDIR__");

    return {
        handle: handle,
        ready: ready,
        args: function () { return fs.existsSync(modDir) ? { "plugin-dir": modDir } : {}; },
        env: env
    };
})();
