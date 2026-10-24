/* The live frames of a Remote Control conversation (a CLI running elsewhere,
   e.g. Adi Tools), for a conversation the app did NOT start itself.

   Those do not come through LocalSessions_$_onEvent (ipc.js) - that is only the
   sessions the app runs. The page reads them from a WebSocket per conversation,
   wss://claude.ai/v1/sessions/ws/<sid>/subscribe. Measured in the app: a second
   subscription opened from this isolated world receives the same frames (user,
   assistant, result, rate_limit_event, system), the exact stream-json shape the
   queue already reads (rows.js). So each conversation the queue cares about gets
   its own subscription here, on screen or not, and the store is fed from it the
   same way store.js is fed from the app's own event stream.

   Only session_/cse_ ids (Remote Control) are subscribed; a local_ id has its
   frames on the IPC channel already. The org is the session's own, looked up
   once, falling back to the account's primary. A dropped socket is reopened
   with a short backoff; subscribe() is idempotent per id. */
window.__ccdRemote = window.__ccdRemote || (function () {
    var subs = {};          /* sid -> subscription state */
    var orgList = null;      /* the account's org uuids, first is primary */

    function isRemote(sid) {
        return /^(session|cse)_/.test(String(sid || ""));
    }

    function getJson(url) {
        return fetch(url, { credentials: "include", headers: { "anthropic-version": "2023-06-01" } })
            .then(function (r) { return r.ok ? r.json() : null; }, function () { return null; });
    }

    /* The account's orgs, the first the primary - the one the page's own
       subscription uses. Measured: /api/organizations is an array of {uuid}. */
    function orgs() {
        if (orgList) return Promise.resolve(orgList);
        return getJson("/api/organizations").then(function (a) {
            orgList = (Array.isArray(a) ? a : []).map(function (o) { return o && o.uuid; }).filter(Boolean);
            return orgList;
        });
    }

    /* Which org a conversation is in is not known up front, and the account has
       more than one, so the subscription cycles through them on reconnect until
       one stays open and sends frames; that org is then remembered for it. A
       socket to the wrong org is closed by the server, which the backoff below
       treats as a reconnect. */
    function open(sub, sid) {
        if (sub.closed || !sub.orgs.length) return;
        var org = sub.orgs[sub.oi % sub.orgs.length];
        var url = "wss://claude.ai/v1/sessions/ws/" + sid + "/subscribe?organization_uuid=" + org;
        var ws;
        try { ws = new WebSocket(url); } catch (e) { retry(sub, sid); return; }
        sub.ws = ws;
        ws.onmessage = function (e) {
            var frame;
            try { frame = JSON.parse(e.data); } catch (x) { return; }
            if (!frame || !frame.type) return;
            sub.org = org; sub.tries = 0;   /* this org works: keep it */
            try { sub.onFrame(frame); } catch (x) {}
        };
        ws.onclose = function () { if (!sub.closed) { if (!sub.org) sub.oi++; retry(sub, sid); } };
        ws.onerror = function () { try { ws.close(); } catch (x) {} };
    }

    function retry(sub, sid) {
        if (sub.closed || sub.timer) return;
        sub.tries = (sub.tries || 0) + 1;
        var wait = Math.min(1000 * sub.tries, 10000);
        sub.timer = setTimeout(function () { sub.timer = 0; open(sub, sid); }, wait);
    }

    /* Deliver every frame of this conversation to onFrame, until the returned
       stop() is called. A no-op for a local_ id. */
    function subscribe(sid, onFrame) {
        if (!isRemote(sid)) return function () {};
        if (subs[sid]) { subs[sid].onFrame = onFrame; return subs[sid].stop; }
        var sub = { onFrame: onFrame, closed: false, tries: 0, timer: 0, orgs: [], oi: 0, org: null };
        sub.stop = function () {
            sub.closed = true;
            if (sub.timer) clearTimeout(sub.timer);
            if (sub.ws) { try { sub.ws.close(); } catch (e) {} }
            delete subs[sid];
        };
        subs[sid] = sub;
        orgs().then(function (list) { sub.orgs = list; if (list.length) open(sub, sid); else sub.stop(); });
        return sub.stop;
    }

    function debug() {
        var o = {};
        for (var k in subs) o[k] = { org: subs[k].org, oi: subs[k].oi, tries: subs[k].tries, open: !!(subs[k].ws && subs[k].ws.readyState === 1) };
        return o;
    }

    return { subscribe: subscribe, isRemote: isRemote, debug: debug };
})();
