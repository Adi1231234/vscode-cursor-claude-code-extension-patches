/* Sandbox-only probe (never part of what ships): what the app's own channels
   really carry, for the facts the desktop queue was built on from reading the
   code - the shape of LocalSessions events, of getSession / getAll records,
   and the address of a local conversation. Sends a summary to probe-main.js
   every 10 s; only types, keys and flags, never message text. */
window.__ccd.patch("sandbox-probe", function () {
    /* A copy in localStorage too: if the IPC send is what fails, the host can
       still read the report out of the profile's leveldb. */
    function stash(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    var ipc = null;
    try { ipc = require("electron").ipcRenderer; } catch (e) { stash("ccd-probe-error", "require: " + e.message); }
    var seen = { types: {}, messageTypes: {}, sessionKeys: null, isRunningSeen: [], firstMessageKeys: null };
    var extra = { getAll: null, getSession: null };

    window.__ccdIpc.on(function (ev) {
        seen.types[ev.type] = (seen.types[ev.type] || 0) + 1;
        if (ev.type === "message" && ev.message) {
            seen.messageTypes[ev.message.type] = (seen.messageTypes[ev.message.type] || 0) + 1;
            if (!seen.firstMessageKeys) seen.firstMessageKeys = Object.keys(ev.message);
        }
        if (ev.session && typeof ev.session === "object") {
            if (!seen.sessionKeys) seen.sessionKeys = Object.keys(ev.session);
            if (typeof ev.session.isRunning === "boolean") seen.isRunningSeen.push(ev.type + ":" + ev.session.isRunning);
            if (seen.isRunningSeen.length > 40) seen.isRunningSeen.shift();
        }
    });

    function shape(v) {
        if (Array.isArray(v)) return { array: v.length, firstKeys: v[0] && typeof v[0] === "object" ? Object.keys(v[0]) : null };
        return v && typeof v === "object" ? { keys: Object.keys(v), isRunning: v.isRunning } : String(v);
    }

    function report() {
        try { send(); } catch (e) { stash("ccd-probe-error", "report: " + (e && e.stack || e)); }
    }

    function send() {
        var cur = window.__ccdSessions.current(), s = cur && window.__ccdSessions.store(cur);
        var shown = window.__ccdQueues && window.__ccdQueues.shown();
        var data = {
            at: new Date().toISOString(), url: location.href, ipcReady: window.__ccdIpc.ready,
            current: cur, busy: s ? s.busy.peek() : null, running: s ? s.running : null,
            messages: s ? s.messages.peek().length : null, remote: cur ? window.__ccdRemote.isRemote(cur) : null,
            lastRows: s ? s.messages.peek().slice(-4).map(function (r) { return r.type + (r.model ? "/" + r.model : "") + ":" + (r.content[0] && r.content[0].content.text || "").slice(0, 20); }) : null,
            queueShown: !!shown, queueApi: shown ? Object.keys(shown.api) : null,
            panel: !!document.querySelector(".__qPanel"), addButton: !!document.querySelector(".__qAdd"),
            composer: !!document.querySelector('[data-testid="code-prompt-input"]'),
            seen: seen, extra: extra,
            queue: shown ? shown.api.__qRemote.run({ op: "list" }).queue : null,
            probe: window.__ccdProbe || null, remoteSubs: window.__ccdRemote.debug(),
            colZoom: (function () { var inp = document.querySelector('[data-testid="code-prompt-input"]'); for (var k = inp; k && k.parentElement; k = k.parentElement) if ((k.parentElement.className || "").indexOf("--titlebar-end-inset") >= 0) return k.style.zoom || "1"; return null; })()
        };
        stash("ccd-probe", data);
        if (ipc) ipc.send("ccd-probe", data);
    }

    window.__ccdIpc.invoke("getAll").then(function (v) { extra.getAll = shape(v); }, function (e) { extra.getAll = "error: " + e.message; });
    setInterval(function () {
        var cur = window.__ccdSessions.current();
        if (cur && !extra.getSession) {
            window.__ccdIpc.invoke("getSession", cur).then(function (v) { extra.getSession = shape(v); }, function (e) { extra.getSession = "error: " + e.message; });
        }
        report();
    }, 3000);
});
