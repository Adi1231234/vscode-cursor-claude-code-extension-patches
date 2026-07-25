
  /* ---------- Which blocks qualify, where the button goes, and re-asserting it ---------- */

  /* The container of the app's own action button, when this message has one. */
  function actionsOf(m) {
    var t = m.querySelector(ACTS);
    return t ? t.parentNode : null;
  }

  function place(m, b) {
    var acts = actionsOf(m);
    if (acts) {
      /* Inside the actions container, position does not matter (both children
         are laid out by flex, and the app's popup is absolutely positioned), so
         only re-parent - never re-order, or we would fight React every time it
         mounts or unmounts that popup. */
      b.classList.add("__ccCopyAct", ACTBTN);
      if (b.parentNode !== acts) acts.appendChild(b);
    } else {
      /* In normal flow the button must stay the LAST child. React knows nothing
         about it, so while a reply streams in it appends new paragraphs after
         our button, stranding the icon in the middle - visually at the top of
         the answer. Re-append whenever it is no longer last; on an already
         attached node that is a move, so it stays idempotent. */
      b.classList.remove("__ccCopyAct", ACTBTN);
      if (m.lastElementChild !== b) m.appendChild(b);
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
    if (!textOf(m)) return false;   /* nothing to copy yet - retry on the next mutation */
    return !!m.querySelector(USERMSG) || hasReplyText(m);
  }

  function ensure() {
    document.querySelectorAll(MSG).forEach(function (m) {
      var b = m.querySelector(".__ccCopy");
      if (!b) {
        if (!wanted(m)) return;
        b = make();
      }
      place(m, b);                 /* re-asserted: the actions container appears later */
    });
  }

  /* Coalesce the observer's bursts into one pass per frame. */
  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; ensure(); });
  }

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})()</script>
