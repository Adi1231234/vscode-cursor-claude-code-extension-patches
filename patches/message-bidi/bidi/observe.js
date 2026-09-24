
  /* ---------- Applying the verdict ---------- */

  var LISTS = "ul,ol";

  /* Only a block that holds no other block is counted, or a list item would be
     counted again through the paragraph inside it. */
  function leaves(root) {
    var out = [];
    root.querySelectorAll(BLOCKS).forEach(function (el) {
      if (!el.querySelector(BLOCKS)) out.push(el);
    });
    return out;
  }

  /* Where one block reads relative to its message: "" to inherit, or the opposite
     direction when the block carries only the other script - an English path or
     quote inside a Hebrew answer, a Hebrew line inside an English one. A block
     with no strong letter either way inherits too: a row of numbers must not
     default to LTR (w3.org/TR/string-meta, "the default direction should not be
     set to LTR"), and flipping it would also drag its list marker inline. */
  function override(text, dir) {
    if (holds(text, dir)) return "";
    var other = dir === "rtl" ? "ltr" : "rtl";
    return holds(text, other) ? other : "";
  }

  /* One message: count its words, declare the direction on the message root, and
     let every block inherit it, overriding only the blocks override() singles out.
     A message with no strongly directional word at all is left alone entirely, so
     the app's own behaviour stands where there is nothing to go on. */
  function apply(root) {
    var blocks = leaves(root);
    var texts = [];
    var counts = { rtl: 0, total: 0 };
    var i;
    for (i = 0; i < blocks.length; i++) {
      texts[i] = textOf(blocks[i]);
      count(texts[i], counts);
    }
    if (!counts.total) return;
    var dir = counts.rtl / counts.total > RTL_SHARE ? "rtl" : "ltr";
    window.__ccDom.setAttr(root, "dir", dir);
    for (i = 0; i < blocks.length; i++) {
      window.__ccDom.setAttr(blocks[i], "dir", override(texts[i], dir) || null);
    }
    root.querySelectorAll(LISTS).forEach(function (list) { markOddItems(list, dir); });
  }

  /* The list itself is deliberately left alone, so every marker stays on the
     message's side and the list reads as one column. An item that ends up
     reading the other way is the exception: its marker would hang off the far
     side of the message, past the list padding (which sits on the opposite
     side), where the markdown root's overflow:hidden clips it away. That one
     draws its marker inline instead - see message-bidi.css. */
  function markOddItems(list, dir) {
    for (var el = list.firstElementChild; el; el = el.nextElementSibling) {
      window.__ccDom.toggle(el, "__ccBidiOdd", !!override(textOf(el), dir));
    }
  }

  /* The cache is the pair (text length we last measured, dir we last wrote):
     length alone would let a React re-render that strips our attribute go
     unnoticed, and comparing against the live attribute makes the pass
     self-healing. A settled chat therefore costs one string length per message. */
  function refresh(root) {
    if (!root.isConnected) return;       /* replaced before its frame came round */
    var len = root.textContent.length;
    if (root.__ccBidiLen === len && root.__ccBidiDir === root.dir) return;
    apply(root);
    root.__ccBidiLen = len;
    root.__ccBidiDir = root.dir;
  }

  /* ---------- Re-asserting it as the chat changes ---------- */

  /* Only the message roots a mutation actually touched are rescanned. A reply
     streaming in fires a burst of mutations every frame while a long chat holds
     hundreds of messages that cannot have changed, so walking the whole document
     each time would be the one thing that makes this patch expensive.

     A record whose target is outside every message root is a message arriving
     (or leaving): only what it ADDED is new. Searching the target instead - the
     list container - marked every message in the transcript dirty each time one
     arrived, and every one of them then cost a full text read to prove it had
     not changed. */
  var dirty = new Set();
  var pending = false;

  function collect(records) {
    records.forEach(function (r) {
      var el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (!el) return;
      var md = el.closest(MD);
      if (md) { dirty.add(md); return; }                                      /* text streaming into a block */
      r.addedNodes.forEach(function (n) {                                     /* a whole message arrived */
        if (n.nodeType !== 1) return;
        if (n.matches(MD)) dirty.add(n);
        else if (n.firstElementChild) n.querySelectorAll(MD).forEach(function (m) { dirty.add(m); });
      });
    });
    if (!dirty.size || pending) return;
    pending = true;
    requestAnimationFrame(flush);
  }

  function flush() {
    pending = false;
    dirty.forEach(refresh);
    dirty.clear();
  }

  /* The shared observer (lib/js/ccWatch.js), with characterData: a streaming
     reply grows an existing text node in place, which childList alone would
     never report. Attributes are not observed by it at all - we write dir, and
     observing it would feed our own writes back. */
  window.__ccWatch.on(collect, { chars: true });

  document.querySelectorAll(MD).forEach(function (m) { dirty.add(m); });
  flush();
})()</script>
