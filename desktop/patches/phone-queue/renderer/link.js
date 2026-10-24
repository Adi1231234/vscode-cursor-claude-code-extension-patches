/* PHONEQUEUE desktop, the Code tab's end of /queue: run what the main
   process posts (main/router.js) through the queue's own surface
   (window.__qRemote, patches/prompt-queue/queue/remote-api.js) and answer.

   A command names the CLI's session; desktop/lib/js/session.js knows which app
   conversation that is, and every conversation has its own queue, on screen
   or not (prompt-queue/host/engines.js). A session this page has never seen
   is not its own: it answers nothing, and main tells the phone so.

   "drop" (withdraw a menu nobody answered) needs the dialog's own reject(),
   which lives in the page's world, out of reach of the preload: it is refused,
   and the menu stays open for the phone to answer. */
window.__ccd.patch("phone-queue", function () {
    var ipc = null;
    try { ipc = require("electron").ipcRenderer; } catch (e) { return; }

    function log(a, b) {
        try { if (window.__ccLog) window.__ccLog("phone", a, b); } catch (e) {}
    }

    function answer(m) {
        var local = window.__ccdSessions.localOf(m.sid);
        if (!local) return { id: m.id };   /* not this page's: main/router.js says so */
        var q = window.__ccdQueues && window.__ccdQueues.of(local), remote = q && q.api.__qRemote;
        if (!remote) return { id: m.id, result: { error: "this page has no queue" } };
        if (m.cmd && m.cmd.op === "drop") {
            log("menu not closed: the app's dialog is out of reach here");
            return { id: m.id, result: { error: "the menu can only be answered or closed in the app" } };
        }
        return { id: m.id, result: remote.run(m.cmd) };
    }

    ipc.on("ccd-phone", function (_e, m) {
        if (!m || !m.cmd) return;
        var out;
        try { out = answer(m); } catch (e) { out = { id: m.id, result: { error: String((e && e.message) || e) } }; }
        ipc.send("ccd-phone-answer", out);
    });
    ipc.send("ccd-phone-hello");
});
