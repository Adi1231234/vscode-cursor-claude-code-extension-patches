/* Shared webview runtime: one MutationObserver per panel, for every patch.

   Four patches each watched the whole document on their own (input-rtl,
   copy-message, message-bidi, background-tasks), and each one's writes woke the
   other three. auto-followup's tooltip rewrite was the clock for all of them:
   three times a second, in every panel, whether anything had happened or not.

   Here there is one observer, and it drops what the patches did themselves:
     - a record whose target is inside a node a patch owns ([data-cc], set with
       __ccDom.own), and
     - a childList record whose added and removed nodes are all owned nodes -
       a patch placing or moving its own button.
   What is left is what the app did, and only that is delivered. That is what
   breaks the loops structurally: a patch cannot wake itself or another patch by
   repainting its own UI, whatever that UI does.

   Removing an owned node is still delivered when the app removes it together
   with its own nodes (a message unmounting). React never removes a node it did
   not create on its own, so "React took our button out" always arrives as the
   removal of an app node, which is not filtered.

   Delivery is synchronous, inside the observer's own callback, once per batch.
   A subscriber that wants to coalesce further (one pass per frame, or per
   task) does that itself - requestAnimationFrame never fires in a hidden
   panel, which is right for UI and wrong for state (see docs in
   patches/background-tasks). */
window.__ccWatch = window.__ccWatch || (function () {
  var subs = [];
  var mo = null;

  function isEl(n) { return n && n.nodeType === 1; }

  function ownedEl(el) {
    return !!(el && el.closest && el.closest("[data-cc]"));
  }

  function inOwned(node) {
    return ownedEl(isEl(node) ? node : node && node.parentElement);
  }

  function allOwned(list) {
    for (var i = 0; i < list.length; i++) {
      if (!isEl(list[i]) || !list[i].hasAttribute("data-cc")) return false;
    }
    return true;
  }

  function fromApp(r) {
    if (inOwned(r.target)) return false;
    if (r.type !== "childList") return true;
    if (!r.addedNodes.length && !r.removedNodes.length) return false;
    return !(allOwned(r.addedNodes) && allOwned(r.removedNodes));
  }

  function deliver(records) {
    var app = [];
    for (var i = 0; i < records.length; i++) if (fromApp(records[i])) app.push(records[i]);
    if (!app.length) return;
    for (var s = 0; s < subs.length; s++) {
      var sub = subs[s], mine = app;
      if (!sub.chars || sub.scope) {
        mine = [];
        var root = sub.scope ? sub.scope() : null;
        if (sub.scope && !root) continue;
        for (var j = 0; j < app.length; j++) {
          var r = app[j];
          if (!sub.chars && r.type === "characterData") continue;
          if (root && !root.contains(r.target)) continue;
          mine.push(r);
        }
        if (!mine.length) continue;
      }
      try { sub.fn(mine); } catch (e) {}
    }
  }

  function start() {
    if (mo || !document.body) return;
    mo = new MutationObserver(deliver);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  /* opts.chars  - also deliver characterData records (text edits in place).
     opts.scope  - a function returning an element; only records inside it are
                   delivered, and nothing while it returns null.
     Returns a function that unsubscribes. */
  function on(fn, opts) {
    var sub = { fn: fn, chars: !!(opts && opts.chars), scope: (opts && opts.scope) || null };
    subs.push(sub);
    start();
    return function () {
      var i = subs.indexOf(sub);
      if (i >= 0) subs.splice(i, 1);
    };
  }

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);

  return { on: on, owned: inOwned };
})();
