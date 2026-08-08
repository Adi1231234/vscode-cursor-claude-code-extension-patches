
  /* ---------- Applying the verdict ---------- */

  var LISTS = "ul,ol";

  function set(el, d) {
    if (d) el.dir = d;
    else el.removeAttribute("dir");
  }

  /* One block, decided on its own text - that is the whole point of the patch.
     The cache is the pair (text length we last measured, dir we last wrote):
     length alone would let a React re-render that strips our attribute go
     unnoticed, and comparing against the live attribute makes the pass
     self-healing. A settled chat therefore costs one string length per block. */
  function decideBlock(el) {
    var len = el.textContent.length;
    if (el.__ccBidiLen === len && el.__ccBidiDir === el.dir) return;
    el.__ccBidiLen = len;
    el.__ccBidiDir = decide(el);
    set(el, el.__ccBidiDir);
  }

  /* The list itself is deliberately left alone, so every marker stays on the
     panel's side and the list reads as one column. An item that ends up reading
     the other way is the exception: its marker would hang off the far side of
     the message, past the list padding (which sits on the opposite side), where
     the markdown root's overflow:hidden clips it away. That one draws its marker
     inline instead - see message-bidi.css. */
  function markOddItems(list) {
    var dir = getComputedStyle(list).direction;
    for (var el = list.firstElementChild; el; el = el.nextElementSibling) {
      el.classList.toggle("__ccBidiOdd", !!el.__ccBidiDir && el.__ccBidiDir !== dir);
    }
  }

  /* Blocks first: the list pass reads the verdict each item just recorded. */
  function apply(root) {
    root.querySelectorAll(BLOCKS).forEach(decideBlock);
    root.querySelectorAll(LISTS).forEach(markOddItems);
  }

  /* ---------- Re-asserting it as the chat changes ---------- */

  /* Only the markdown roots a mutation actually touched are rescanned. A reply
     streaming in fires a burst of mutations every frame while a long chat holds
     hundreds of blocks that cannot have changed, so walking the whole document
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
    dirty.forEach(apply);
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
