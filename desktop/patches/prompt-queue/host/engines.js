/* One queue per conversation, and which one draws.

   The editor gives every conversation a panel of its own, and its queue runs
   there whether the panel is in front or not. The app shows one conversation
   at a time, so each conversation gets a queue of its own here
   (__ccdQueueEngine, the shared queue as a factory), kept running when its
   conversation leaves the screen: it sends the next item when that
   conversation's run ends, through the app's own sendMessage (store.js). Only
   the queue of the conversation on screen draws; the one leaving takes its
   panel and buttons down first.

   The "New session" page has no conversation until its first message. Its
   queue (the draft) becomes that conversation's queue when the page turns
   into it right after a send from the page - not when the person just opens
   another conversation from there, which would carry the draft's items into
   a conversation they were never meant for.

   __ccdQueues.of(id) hands out a conversation's queue - made on first use,
   restored held from what was saved - for the phone (phone-queue). */
window.__ccd.patch("prompt-queue", function () {
    var S = window.__ccdSessions;
    var queues = {}, draft = null, shown = null, sentFromNewAt = 0;
    var ADOPT_MS = 30000;

    function makeHost(id) {
        var h = { id: id, api: {}, bind: null };
        h.store = function () { return h.id ? S.store(h.id) : null; };
        h.onScreen = function () { return shown === h; };
        h.source = function (bind) { h.bind = bind; var s = h.store(); if (s) bind(s); };
        h.publish = function (name, api) { h.api[name] = api; return api; };
        return h;
    }

    function make(id) {
        var h = makeHost(id);
        h.engine = window.__ccdQueueEngine(h);
        return h;
    }

    function adopt(id) {
        var h = draft;
        draft = null;
        h.id = id;
        queues[id] = h;
        if (h.bind) h.bind(S.store(id));
        return h;
    }

    function show(id, prev) {
        if (shown) shown.engine.detach();
        var h;
        if (!id) h = draft || (draft = make(null));
        else if (queues[id]) h = queues[id];
        else if (draft && !prev && Date.now() - sentFromNewAt < ADOPT_MS) h = adopt(id);
        else h = queues[id] = make(id);
        shown = h;
        h.engine.pass();
    }

    /* A send from the "New session" page: Enter in its composer, or its Send. */
    function noteSend(ev) {
        if (S.current()) return;
        var t = ev.target;
        var enter = ev.type === "keydown" && ev.key === "Enter" && !ev.shiftKey && !ev.altKey &&
            t && t.closest && t.closest('[data-testid="code-prompt-input"]');
        var click = ev.type === "click" && t && t.closest && t.closest('[data-testid="code-prompt-send"]');
        if (enter || click) sentFromNewAt = Date.now();
    }

    window.__ccdQueues = {
        of: function (id) { return queues[id] || (id ? (queues[id] = make(id)) : null); },
        shown: function () { return shown; }
    };
    document.addEventListener("keydown", noteSend, true);
    document.addEventListener("click", noteSend, true);
    S.onCurrent(show);
    show(S.current(), null);
});
