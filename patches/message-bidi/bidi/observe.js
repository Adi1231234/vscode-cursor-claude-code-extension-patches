
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

  /* One message: count its words, declare the direction on the message root, and
     let every block inherit it. A block gets its own dir only when it holds no
     letter of the message's script at all - an English quote or a path inside a
     Hebrew answer - which is the one case the direction genuinely changes.
     A message with no strong words at all is left alone entirely. */
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
    root.dir = dir;
    for (i = 0; i < blocks.length; i++) {
      if (holds(texts[i], dir)) blocks[i].removeAttribute("dir");
      else blocks[i].dir = dir === "rtl" ? "ltr" : "rtl";
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
      el.classList.toggle("__ccBidiOdd", !holds(textOf(el), dir));
    }
  }

  /* The cache is the pair (text length we last measured, dir we last wrote):
     length alone would let a React re-render that strips our attribute go
     unnoticed, and comparing against the live attribute makes the pass
     self-healing. A settled chat therefore costs one string length per message. */
  function refresh(root) {
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
     each time would be the one thing that makes this patch expensive. */
  var dirty = new Set();
  var pending = false;

  function collect(records) {
    records.forEach(function (r) {
      var el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (!el) return;
      var md = el.closest(MD);
      if (md) dirty.add(md);                                                  /* text streaming into a block */
      else el.querySelectorAll(MD).forEach(function (m) { dirty.add(m); });    /* a whole message arrived */
    });
    if (pending) return;
    pending = true;
    requestAnimationFrame(flush);
  }

  function flush() {
    pending = false;
    dirty.forEach(refresh);
    dirty.clear();
  }

  /* characterData too: a streaming reply grows an existing text node in place,
     which childList alone would never report. Attributes are deliberately not
     observed - we write dir, and observing it would feed our own writes back. */
  new MutationObserver(collect).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  document.querySelectorAll(MD).forEach(function (m) { dirty.add(m); });
  flush();
})()</script>
