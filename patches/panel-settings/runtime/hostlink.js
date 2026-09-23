/* The panel's end of the conversation with the host: one sender, one listener,
   and "did anything come back?".

   Two halves of this patch load at different moments. webview/index.js is read
   when a panel opens, so the dialog, the toggles and this file are whatever the
   last apply.ps1 wrote. extension.js is loaded once, when the window's
   extension host starts, and nothing short of a real Developer: Reload Window
   replaces it. A window left open across an apply.ps1 run therefore shows a
   switch whose gate lives in code that window has never loaded - measured on
   2026-09-23: a window running the 2026-09-22T08:43Z host raised a toast on
   every finish while its own "Stay quiet while this window is focused" was on,
   because the gate arrived hours after that host did.

   Nothing here polls. The reply is a message, and the only timer is the one
   that gives up waiting for it. */
var __ccSettingsWaiting = [];
var __ccSettingsListening = false;

/* Registered on first use rather than at load: this file is prepended to the
   webview bundle, and nothing of ours may run while that bundle is still
   evaluating. */
function __ccSettingsListen() {
    if (__ccSettingsListening) return;
    __ccSettingsListening = true;
    window.addEventListener("message", function (ev) {
        var m = ev && ev.data;
        if (!m || m.type !== "__ccnotify") return;
        if (m.op === "decided") {
            __ccSettingsNote("host", (m.shown ? "toast raised" : "stayed quiet") +
                " - this window was " + (m.focused ? "focused" : "not focused"));
        }
        if (m.op === "decided" || m.op === "pong") __ccSettingsAnswered();
    });
}

function __ccSettingsAnswered() {
    var waiting = __ccSettingsWaiting;
    __ccSettingsWaiting = [];
    for (var i = 0; i < waiting.length; i++) {
        try { waiting[i](); } catch (e) {}
    }
}

/* connection.value is the app's own host back-channel - the same one every
   other injected patch here uses, and the reason none of them goes anywhere
   near acquireVsCodeApi. */
function __ccSettingsSend(session, msg) {
    __ccSettingsListen();
    try {
        var connection = session && session.connection && session.connection.value;
        if (!connection || typeof connection.send !== "function") return false;
        connection.send(msg);
        return true;
    } catch (e) {
        return false;
    }
}

/* cb(true) on the host's next reply, cb(false) if it stays silent. A host that
   understands the message answers within a message round trip; one that does
   not swallows it and never will, so the wait only has to outlast the round
   trip. */
var __ccSettingsReplyMs = 2000;

/* What a silent host means, in one sentence, for the log and for the dialog -
   the same words in both, so the line someone finds in the log is the line the
   dialog showed them. */
function __ccSettingsStaleText() {
    return "This window is running an older build of these patches, so these settings" +
        " are not applied here. Reload the window (Developer: Reload Window).";
}

function __ccSettingsAfterReply(cb) {
    var settled = false;
    function settle(ok) {
        if (settled) return;
        settled = true;
        try { cb(ok); } catch (e) {}
    }
    __ccSettingsWaiting.push(function () { settle(true); });
    setTimeout(function () { settle(false); }, __ccSettingsReplyMs);
}
