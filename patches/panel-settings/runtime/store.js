/* The panel's own settings, in localStorage.

   The key carries no session id on purpose. Every Claude panel in a window
   shares one webview origin, so a key without a session id is read by all of
   them - which is exactly what a preference should be: turn it on here and the
   next chat, and the panel beside it, already have it. (A key that does carry a
   session id is private to that conversation; that is what the queue uses.)

   Nothing here runs at load: touching localStorage while the bundle is still
   evaluating breaks the Cursor webview, so every access sits behind a function
   the panel only calls once it is up. The stored shape is versioned the way the
   saved queues are, and every read has to survive a null, a parse error and a
   value written by a future version. */
var __ccSettingsKey = "ccSettings";

var __ccSettingsDefaults = {
    notifyOnFinish: false
};

function __ccSettingsRead() {
    var out = {};
    for (var k in __ccSettingsDefaults) out[k] = __ccSettingsDefaults[k];
    try {
        var raw = JSON.parse(localStorage.getItem(__ccSettingsKey) || "null");
        if (raw && raw.values) {
            for (var name in __ccSettingsDefaults) {
                if (typeof raw.values[name] === typeof __ccSettingsDefaults[name]) {
                    out[name] = raw.values[name];
                }
            }
        }
    } catch (e) {}
    return out;
}

function __ccSettingsGet(name) {
    return __ccSettingsRead()[name];
}

/* Returns whether it stuck: a full quota is the one failure worth telling the
   user about, since the toggle would otherwise flip back on the next read. */
function __ccSettingsSet(name, value) {
    try {
        var values = __ccSettingsRead();
        values[name] = value;
        localStorage.setItem(__ccSettingsKey, JSON.stringify({ v: 1, values: values }));
        return true;
    } catch (e) {
        return false;
    }
}
