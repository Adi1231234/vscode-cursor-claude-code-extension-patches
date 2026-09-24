(function () {
  /* dir=auto on the composer and its @-mention mirror, so a line typed in a
     right-to-left language renders in its own direction.

     The app mounts and remounts both elements, so this cannot be done once at
     load. It used to be a MutationObserver of its own over the whole document,
     answering every batch of changes - every streamed chunk, in every panel -
     with a document-wide querySelectorAll. Measured on 2026-09-24 that was 9.5%
     of the renderer thread all sixteen panels share, for an attribute that
     changes about once per conversation.

     Now it listens to the shared observer (lib/js/ccWatch.js) and only looks
     inside what the app just added: the composer arrives as an added node, so a
     batch that added nothing it could be never touches the document at all. */
  var SEL = ".__MSGINPUT__:not([dir]),.__MIRROR__:not([dir])";

  function mark(el) {
    window.__ccDom.setAttr(el, "dir", "auto");
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches(SEL)) mark(root);
    if (!root.firstElementChild) return;
    var found = root.querySelectorAll(SEL);
    for (var i = 0; i < found.length; i++) mark(found[i]);
  }

  scan(document.body);

  window.__ccWatch.on(function (records) {
    for (var i = 0; i < records.length; i++) {
      var added = records[i].addedNodes;
      for (var j = 0; j < added.length; j++) scan(added[j]);
    }
  });
})();</script>
