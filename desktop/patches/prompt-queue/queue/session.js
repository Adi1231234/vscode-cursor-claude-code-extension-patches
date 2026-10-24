/* The current Code conversation's id, for per-conversation queue persistence.
   On the web it is in the path (/code/session_<id>); on the desktop shell it may
   be a query param or absent, so we fall back to a stable per-surface key. All
   Code tabs share one localStorage origin, so a key that carries the id is
   private to that conversation (the same fact the webview queue relies on). */
window.__ccq = window.__ccq || {};
window.__ccq.sessionId = function () {
    var m = location.pathname.match(/session[_-]([A-Za-z0-9]+)/) ||
            location.search.match(/session[=_-]([A-Za-z0-9]+)/);
    if (m) return m[1];
    return location.pathname.indexOf("/code") >= 0 ? "code-root" : "default";
};
