/* The queue itself: an ordered list of pending messages plus a paused flag, one
   per conversation, persisted to localStorage (key carries the session id, so it
   is private to this conversation and survives a reload). Pure state - no DOM.
   Subscribers are notified on every change. */
(function () {
    function key() { return "ccq:" + __ccq.sessionId(); }
    var loadedFor = null;
    var state = { items: [], paused: false };
    var subs = [];

    function load() {
        try {
            var j = JSON.parse(localStorage.getItem(key()) || "{}");
            state = { items: Array.isArray(j.items) ? j.items : [], paused: !!j.paused };
        } catch (e) { state = { items: [], paused: false }; }
        loadedFor = __ccq.sessionId();
    }
    function sync() { if (loadedFor !== __ccq.sessionId()) { load(); emit(); } }
    function save() { try { localStorage.setItem(key(), JSON.stringify(state)); } catch (e) { /* private mode */ } emit(); }
    function emit() { subs.slice().forEach(function (f) { try { f(); } catch (e) {} }); }

    load();

    __ccq.list = function () { sync(); return state.items.slice(); };
    __ccq.count = function () { sync(); return state.items.length; };
    __ccq.add = function (t) { sync(); t = (t || "").trim(); if (t) { state.items.push(t); save(); } };
    __ccq.removeAt = function (i) { sync(); if (i >= 0 && i < state.items.length) { state.items.splice(i, 1); save(); } };
    __ccq.update = function (i, t) {
        sync(); if (i < 0 || i >= state.items.length) return;
        t = (t || "").trim();
        if (t) state.items[i] = t; else state.items.splice(i, 1);
        save();
    };
    __ccq.move = function (i, d) {
        sync(); var j = i + d;
        if (i >= 0 && i < state.items.length && j >= 0 && j < state.items.length) {
            state.items.splice(j, 0, state.items.splice(i, 1)[0]); save();
        }
    };
    __ccq.shift = function () { sync(); var x = state.items.shift(); save(); return x; };
    __ccq.clear = function () { sync(); state.items = []; save(); };
    __ccq.paused = function () { sync(); return state.paused; };
    __ccq.setPaused = function (p) { sync(); state.paused = !!p; save(); };
    __ccq.onChange = function (fn) { subs.push(fn); };
})();
