/* PHONEQUEUE host, the listener: where the CLI's /queue arrives.

   The mod (mod/hooks/register.js) POSTs { panel, sid, cmd } to the address it
   finds in CC_PHONE_QUEUE_URL. This serves that address on 127.0.0.1, at a
   random path that is the key, and hands each command to ask(panel, sid, cmd),
   whose answer goes back to the CLI as is. What ask does is the host's own:
   the editor posts it to the panel that spawned the CLI (server.js), the
   desktop app to its Code tab (desktop/patches/phone-queue/main/router.js).

   Listening is a few ms after load and a CLI is spawned seconds later; ready
   settles either way, with the address or with "" when nothing could listen.
   The server never keeps the process alive on its own. */
function ccPhoneListen(ask) {
    var http = require("http");
    var crypto = require("crypto");
    var BODY_MAX = 65536;
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
            Promise.resolve(ask(String(msg.panel || ""), msg.sid, msg.cmd))
                .then(function (out) { reply(res, 200, out || {}); },
                      function (e) { reply(res, 200, { error: String((e && e.message) || e) }); });
        });
    }

    var server = http.createServer(serve);
    var ready = new Promise(function (resolve) {
        server.on("error", function () { url = ""; resolve(""); });
        server.listen(0, "127.0.0.1", function () {
            url = "http://127.0.0.1:" + server.address().port + key;
            resolve(url);
        });
    });
    server.unref();

    return { ready: ready, url: function () { return url; } };
}
