/* Shared webview runtime: find the app's session store.

   The store is the object that owns send(), the Preact signals (messages, busy,
   subagentTasks, ...) and .connection - and .connection.value.send() is the only
   sanctioned way to reach the extension host, because reassigning
   window.acquireVsCodeApi silently blanks the whole panel. The store is not on any
   global, so the React fiber tree is the route to it.

   Injected by more than one patch; every definition is guarded so the first one
   in wins and the rest are no-ops. */
globalThis.__ccFiber = globalThis.__ccFiber || function (node) {
  if (!node) return null;
  try {
    var ks = Object.keys(node);
    for (var i = 0; i < ks.length; i++) {
      if (ks[i].indexOf("__reactFiber$") === 0 || ks[i].indexOf("__reactInternalInstance$") === 0) return node[ks[i]];
    }
  } catch (e) {}
  return null;
};

globalThis.__ccStore = globalThis.__ccStore || (function () {
  var cached = null, cachedEl = null;

  function qs(sel) { return document.querySelector(sel); }
  function inp() { return qs('[aria-label="Message input"][contenteditable]'); }

  function fromProps(p) {
    if (p && p.session && typeof p.session.send === "function") return p.session;
    return null;
  }

  function searchUp(node) {
    var f = globalThis.__ccFiber(node), d = 0;
    while (f && d < 300) {
      var s = fromProps(f.memoizedProps);
      if (s) return s;
      f = f.return;
      d++;
    }
    return null;
  }

  function searchDown(node) {
    var f = globalThis.__ccFiber(node);
    if (!f) return null;
    var stack = [f], n = 0;
    while (stack.length && n < 4000) {
      var cur = stack.pop();
      n++;
      var s = fromProps(cur.memoizedProps);
      if (s) return s;
      if (cur.child) stack.push(cur.child);
      if (cur.sibling) stack.push(cur.sibling);
    }
    return null;
  }

  return function () {
    try {
      var e = inp();
      if (cached && cachedEl === e && typeof cached.send === "function") return cached;
      var anchors = [e];
      if (e) {
        if (e.closest) anchors.push(e.closest("form"));
        anchors.push(e.parentElement);
      }
      anchors.push(qs('[class*="messageInputContainer"]'));
      anchors.push(qs('[class*="composer"]'));
      anchors.push(qs("#root"));
      for (var a = 0; a < anchors.length; a++) {
        if (!anchors[a]) continue;
        var s = searchUp(anchors[a]);
        if (s) { cached = s; cachedEl = e; return s; }
      }
      var down = searchDown(qs("#root"));
      if (down) { cached = down; cachedEl = e; return down; }
    } catch (err) {}
    cached = null;
    cachedEl = null;
    return null;
  };
})();
