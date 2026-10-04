/* PHONEQUEUE host, the panels: which panel spawned which CLI, and asking it.

   Routing by who spawned the CLI, not by session id: in a new conversation the
   panel learns its session id only after the first command has finished, and
   that command was waiting on the panel - measured in the lab, the first
   /queue of every new tab answered "no panel", however long the host waited.
   spawnClaude runs on the panel's own comms object, whose `webview` is the very
   object the panel's messages arrive from, so the token is exact.

   A panel that was closed is noticed on the next ask: VS Code's postMessage
   resolves false on a disposed webview rather than throwing. And the webview is
   held weakly, so a closed panel's webview (and its HTML) is not kept alive
   here for the life of the window. server.js builds this once. */
function ccPhonePanels(CH, REPLY_MS) {
    var crypto = require("crypto");
    var panels = new Map();     /* token -> WeakRef of the spawning panel's webview */
    var tokens = new WeakMap(); /* webview -> its token, so a respawn reuses it */
    var waiting = new Map();    /* request id -> { wv, settle } */
    var lastId = 0;

    function token(wv) {
        var tok = tokens.get(wv);
        if (!tok) {
            tok = crypto.randomBytes(12).toString("hex");
            tokens.set(wv, tok);
            panels.set(tok, new WeakRef(wv));
        }
        return tok;
    }

    function webviewOf(tok) {
        var ref = panels.get(tok), wv = ref && ref.deref();
        if (ref && !wv) panels.delete(tok);
        return wv || null;
    }

    /* Ask the panel that spawned the asking CLI to run cmd; resolves with its
       answer or an error. sid rides along so the panel can refuse a command for
       a conversation it no longer shows. */
    function ask(tok, sid, cmd) {
        var wv = webviewOf(tok);
        if (!wv) {
            return Promise.resolve({ error: tok
                ? "the panel that started this conversation is gone - open it again"
                : "this conversation started before the phone-queue patch - restart it in the panel" });
        }
        return new Promise(function (resolve) {
            var id = ++lastId;
            function settle(result) {
                if (!waiting.has(id)) return;
                clearTimeout(timer);
                waiting.delete(id);
                resolve(result || {});
            }
            function closed() {
                panels.delete(tok);
                settle({ error: "the panel holding this conversation was closed" });
            }
            /* Late is not the same as not done: a busy panel may still apply it. */
            var timer = setTimeout(function () {
                settle({ error: "the panel took too long to answer - it may still have done it, check with /queue list" });
            }, REPLY_MS);
            waiting.set(id, { wv: wv, settle: settle });
            Promise.resolve()
                .then(function () { return wv.postMessage({ type: CH, op: "run", id: id, sid: sid, cmd: cmd }); })
                .then(function (delivered) { if (delivered === false) closed(); }, closed);
        });
    }

    /* A panel's answer counts only when it comes from the webview it was
       asked of. */
    function answer(msg, from) {
        var w = waiting.get(msg.id);
        if (w && (!from || w.wv === from)) w.settle(msg.result);
    }

    return { token: token, ask: ask, answer: answer };
}
