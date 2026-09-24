
  /* ---------- Which blocks qualify, where the button goes, and re-asserting it ---------- */
  var D = window.__ccDom;

  function place(m, b) {
    var t = m.querySelector(ACTS);            /* the app's own action button */
    var acts = t ? t.parentNode : null;
    D.toggle(b, "__ccCopyAct", !!acts);
    D.toggle(b, ACTBTN, !!acts);
    if (acts) {
      /* The container is marked rather than matched with div:has(): React
         leaves an attribute it did not set alone, and a plain attribute
         selector costs nothing when the rest of the page changes, where a
         :has() over every div is re-checked on every class change anywhere
         (see copy-message.css).

         Ours has to come somewhere AFTER the app's button - the reveal rule is
         a sibling combinator from it - but nowhere in particular after that:
         the app's popup is absolutely positioned, so where it lands does not
         matter, and re-ordering against it would fight React every time it
         mounts or unmounts. So move only when ours is outside the container or
         ahead of the app's button (a remount appends the app's button after
         ours), and then to just behind it. 4 is DOCUMENT_POSITION_FOLLOWING. */
      D.setAttr(acts, "data-cc-acts", true);
      if (b.parentNode !== acts || !(t.compareDocumentPosition(b) & 4)) {
        acts.insertBefore(b, t.nextSibling);
      }
    } else if (m.lastElementChild !== b) {
      /* In normal flow the button must stay the LAST child. React knows nothing
         about it, so while a reply streams in it appends new paragraphs after
         our button, stranding the icon in the middle - visually at the top of
         the answer. Re-append whenever it is no longer last; on an already
         attached node that is a move, and a move of an owned node never comes
         back to us through the shared observer. */
      m.appendChild(b);
    }
  }

  /* Real reply prose: rendered markdown that is not nested inside a thinking
     block or a tool call. An expanded thinking block renders markdown too, which
     is why the ancestor check is needed rather than a plain lookup. */
  function hasReplyText(m) {
    var md = m.querySelectorAll(MD);
    for (var i = 0; i < md.length; i++) {
      if (!md[i].closest(NOTTEXT)) return true;
    }
    return false;
  }

  /* Only actual messages get an icon. An assistant message is split into one
     message_<hash> block per content item, so a bare tool call, a tool result
     and a collapsed "Thinking" row are each their own block - none of them is
     something you would want to copy, and decorating them buried the chat in
     icons. */
  function wanted(m) {
    if (!hasText(m)) return false;  /* nothing to copy yet - asked again when it changes */
    return !!m.querySelector(USERMSG) || hasReplyText(m);
  }

  function ensureOne(m) {
    if (!m.isConnected) return;
    var b = m.querySelector(".__ccCopy");
    if (!b) {
      if (!wanted(m)) return;
      b = make();
    }
    place(m, b);                 /* re-asserted: the actions container appears later */
  }

  /* Only the messages the app actually touched.

     This used to answer every batch of changes anywhere in the panel with a pass
     over the whole transcript - 490 messages, and a full text read of every
     tool call and thinking block that had no button, each time - and in every
     panel, because another patch's tooltip rewrite woke it three times a
     second. Now a message is looked at when a change lands inside it or it
     arrives, which is also the only time its answer to wanted() can change. */
  var dirty = new Set(), all = true, pending = false;

  function collect(records) {
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      var m = t && t.closest(MSG);
      if (m) { dirty.add(m); continue; }
      var added = r.addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType !== 1) continue;
        if (n.matches(MSG)) dirty.add(n);
        else if (n.firstElementChild) n.querySelectorAll(MSG).forEach(function (x) { dirty.add(x); });
      }
    }
  }

  function pass() {
    pending = false;
    if (all) {
      all = false;
      document.querySelectorAll(MSG).forEach(ensureOne);
      dirty.clear();
      return;
    }
    var list = Array.from(dirty);
    dirty.clear();
    for (var i = 0; i < list.length; i++) ensureOne(list[i]);
  }

  /* One pass per frame. requestAnimationFrame does not fire in a hidden panel,
     and that is right here: the icon is only ever looked at, so a hidden panel
     keeps its dirty set and catches up the moment it is shown. */
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(pass);
  }

  window.__ccWatch.on(function (records) {
    collect(records);
    if (dirty.size) schedule();
  });
  schedule();
})()</script>
