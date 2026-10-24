/* Sandbox-only: test actions the host sends through probe-main.js (it watches
   C:\ccd\out\cmd.json), run in the real Code tab, with their outcome and a
   short event trail kept in window.__ccdProbe for probe-renderer.js to report:
     { action: "queue", cmd, sid? }  a /queue command on a conversation's queue
                                     (the one on screen without sid)
     { action: "new" }               press the sidebar's New
     { action: "click", text }       press the link or button with that text
     { action: "open", sid }         open a conversation from the sidebar
     { action: "type", text }        type into the composer and press Enter
   Only event types, frame types and isRunning go in the trail, never text. */
window.__ccd.patch("sandbox-probe-actions", function () {
    var ipc = require("electron").ipcRenderer;
    var P = window.__ccdProbe = { trail: [], last: null };

    window.__ccdIpc.on(function (ev) {
        var e = { t: Date.now() % 1000000, type: ev.type, sid: String(ev.sessionId || "").slice(-6) };
        if (ev.message) e.frame = ev.message.type + (ev.message.subtype ? "/" + ev.message.subtype : "");
        if (ev.session && typeof ev.session.isRunning === "boolean") e.running = ev.session.isRunning;
        if (ev.type === "message" && ev.message && ev.message.type === "user") {
            var c = ev.message.message && ev.message.message.content;
            e.userText = typeof c === "string" ? c.slice(0, 40) : (c && c[0] && c[0].text ? c[0].text.slice(0, 40) : "");
        }
        P.trail.push(e);
        if (P.trail.length > 80) P.trail.shift();
    });

    function clickText(t) {
        var el = [].slice.call(document.querySelectorAll("a,button,[role=button],[role=link],[role=option],li")).filter(function (n) { return n.textContent.trim() === t; })[0];
        if (el) el.click();
        return !!el;
    }

    function run(a) {
        if (a.action === "queue") {
            var q = a.sid ? window.__ccdQueues.of(a.sid) : window.__ccdQueues.shown();
            return q ? q.api.__qRemote.run(a.cmd) : "no queue";
        }
        if (a.action === "new") return clickText("New");
        if (a.action === "click") return clickText(a.text);
        if (a.action === "open") {
            var link = document.querySelector('a[href*="' + a.sid + '"]');
            if (link) link.click();
            return !!link;
        }
        if (a.action === "type") {
            var e = document.querySelector('[data-testid="code-prompt-input"]');
            if (!e) return "no composer";
            e.focus();
            document.execCommand("insertText", false, a.text);
            setTimeout(function () {
                e.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
            }, 50);
            return true;
        }
        if (a.action === "stop") { var b = document.querySelector('[data-testid="code-prompt-stop"]'); if (b) { b.click(); return "stopped"; } return "no stop button"; }
        if (a.action === "hook") return hookPage();
        if (a.action === "myws") return myWs(a.sid, a.org);
        return "unknown action";
    }

    /* Can our own world open a second subscription and get the same frames,
       without touching the page? Test only. */
    function myWs(sid, org) {
        P.myws = [];
        var url = "wss://claude.ai/v1/sessions/ws/" + sid + "/subscribe?organization_uuid=" + org;
        var s;
        try { s = new WebSocket(url); } catch (e) { P.myws.push("ctor: " + e.message); return "ctor error"; }
        s.onopen = function () { P.myws.push("open"); };
        s.onerror = function () { P.myws.push("error"); };
        s.onclose = function (e) { P.myws.push("close " + e.code); };
        s.onmessage = function (e) {
            if (P.myws.length > 20) return;
            try { var j = JSON.parse(e.data); P.myws.push({ type: j.type, has: Object.keys(j).slice(0, 8) }); }
            catch (x) { P.myws.push("raw " + String(e.data).slice(0, 80)); }
        };
        return "opened";
    }

    /* Learn how the page talks to a remote conversation: in the page's own
       world (webFrame), report every write to /v1/code/ and every socket or
       stream it opens, back to this world by postMessage. Test only. */
    function hookPage() {
        require("electron").webFrame.executeJavaScript(
            "(function(){if(window.__ccdHooked)return;window.__ccdHooked=1;" +
            "var post=function(o){try{window.postMessage({__ccdNet:o},'*')}catch(e){}};" +
            "var f=window.fetch;window.fetch=function(i,init){try{var u=typeof i==='string'?i:(i&&i.url)||String(i);var m=(init&&init.method)||(i&&i.method)||'GET';" +
            "if(m!=='GET'&&u.indexOf('/v1/')>=0)post({kind:'fetch',m:m,u:u,b:String(init&&init.body||'').slice(0,900)})}catch(e){}return f.apply(this,arguments)};" +
            "var W=window.WebSocket;window.WebSocket=function(u,p){post({kind:'ws',u:String(u)});var s=p===undefined?new W(u):new W(u,p);s.addEventListener('message',function(e){try{var d=e.data;if(typeof d==='string'){var j=JSON.parse(d);post({kind:'wsframe',keys:Object.keys(j),type:j.type||j.event_type,ptype:j.payload&&j.payload.type,pkeys:j.payload&&Object.keys(j.payload).slice(0,12),inner:JSON.stringify(j).slice(0,500)})}else post({kind:'wsframe',binary:true})}catch(x){post({kind:'wsframe',raw:String(e.data).slice(0,200)})}});return s};window.WebSocket.prototype=W.prototype;" +
            "var E=window.EventSource;if(E){window.EventSource=function(u,o){post({kind:'sse',u:String(u)});return new E(u,o)};window.EventSource.prototype=E.prototype}" +
            "})()");
        return "hooked";
    }

    window.addEventListener("message", function (ev) {
        var n = ev.data && ev.data.__ccdNet;
        if (!n) return;
        P.net = P.net || [];
        P.net.push(n);
        if (P.net.length > 30) P.net.shift();
    });

    ipc.on("ccd-probe-cmd", function (_e, a) {
        var out;
        try { out = run(a); } catch (err) { out = "threw: " + err.message; }
        P.last = { id: a.id, action: a.action, out: out };
    });
});
