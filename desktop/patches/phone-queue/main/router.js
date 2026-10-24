/* PHONEQUEUE desktop, main process: a /queue command to the Code tab.

   The editor posts a command to the panel that spawned the asking CLI. The app
   has one main process for every conversation and draws them in its Code tab,
   so a command goes to every Code tab page our preload runs in, and the one
   showing that conversation answers (renderer/link.js); the others answer
   with nothing, and when none had it the phone is told to open it. A page
   announces itself on load ("hello") and is dropped when it goes, so pages
   without our preload are never waited on.

   Answers count only from the page they were asked of. Late is not the same as
   not done: a busy page may still apply a command after the wait. */
function ccdPhoneRouter() {
    var ipcMain = require("electron").ipcMain;
    var CH = "ccd-phone", ANSWER = "ccd-phone-answer", HELLO = "ccd-phone-hello";
    var REPLY_MS = 5000;
    var NOT_OPEN = "this conversation is not on screen in the Claude app - open it there to steer its queue";
    var pages = new Set();
    var waiting = new Map();
    var lastId = 0;

    ipcMain.on(HELLO, function (ev) {
        var wc = ev.sender;
        if (pages.has(wc)) return;
        pages.add(wc);
        wc.once("destroyed", function () { pages.delete(wc); });
    });

    ipcMain.on(ANSWER, function (ev, msg) {
        var w = msg && waiting.get(msg.id);
        if (w && w.asked.has(ev.sender)) w.got(msg);
    });

    function ask(_panel, sid, cmd) {
        var asked = new Set();
        pages.forEach(function (wc) { if (!wc.isDestroyed()) asked.add(wc); });
        if (!asked.size) return Promise.resolve({ error: "the Claude app has no Code tab open" });
        return new Promise(function (resolve) {
            var id = ++lastId, left = asked.size;
            function settle(result) {
                if (!waiting.has(id)) return;
                clearTimeout(timer);
                waiting.delete(id);
                resolve(result);
            }
            var timer = setTimeout(function () {
                settle({ error: "the app took too long to answer - it may still have done it, check with /queue list" });
            }, REPLY_MS);
            waiting.set(id, {
                asked: asked,
                got: function (msg) {
                    if (msg.result) { settle(msg.result); return; }
                    if (--left === 0) settle({ error: NOT_OPEN });
                }
            });
            asked.forEach(function (wc) {
                try { wc.send(CH, { id: id, sid: sid, cmd: cmd }); } catch (e) { if (--left === 0) settle({ error: NOT_OPEN }); }
            });
        });
    }

    return { ask: ask };
}
