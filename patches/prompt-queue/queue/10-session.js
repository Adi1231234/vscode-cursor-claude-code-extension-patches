  /* ---------- React fiber / session discovery ---------- */
  var _session = null, _sessEl = null, _ctx = null;

  function fiberOf(node) {
    if (!node) return null;
    try {
      var ks = Object.keys(node);
      for (var i = 0; i < ks.length; i++) {
        if (ks[i].indexOf("__reactFiber$") === 0 || ks[i].indexOf("__reactInternalInstance$") === 0) return node[ks[i]];
      }
    } catch (e) {}
    return null;
  }

  function sessionFromProps(p) {
    if (p && p.session && typeof p.session.send === "function") {
      if (p.context) _ctx = p.context;
      return p.session;
    }
    return null;
  }

  function searchUp(node) {
    var f = fiberOf(node), d = 0;
    while (f && d < 300) {
      var s = sessionFromProps(f.memoizedProps);
      if (s) return s;
      f = f.return;
      d++;
    }
    return null;
  }

  function searchDown(node) {
    var f = fiberOf(node);
    if (!f) return null;
    var stack = [f], n = 0;
    while (stack.length && n < 4000) {
      var cur = stack.pop();
      n++;
      var s = sessionFromProps(cur.memoizedProps);
      if (s) return s;
      if (cur.child) stack.push(cur.child);
      if (cur.sibling) stack.push(cur.sibling);
    }
    return null;
  }

  function getSession() {
    try {
      var e = inp();
      if (_session && _sessEl === e && typeof _session.send === "function") return _session;
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
        if (s) { _session = s; _sessEl = e; return s; }
      }
      var down = searchDown(qs("#root"));
      if (down) { _session = down; _sessEl = e; return down; }
    } catch (err) {}
    _session = null;
    _sessEl = null;
    return null;
  }

  function useCtrlEnter() {
    try {
      getSession();
      return !!(_ctx && _ctx.useCtrlEnterToSend === true);
    } catch (e) {
      return false;
    }
  }

