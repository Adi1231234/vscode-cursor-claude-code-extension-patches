<script nonce="${__NONCE__}">/* COPYMSG */(function(){
  /* A copy-to-clipboard icon for every chat message. Two placements:
       - user messages: inside the app's own "Message actions" container, next
         to the round rewind/fork button, wearing the app's actionButton class
         so it inherits that look and hover reveal exactly;
       - everything else: normal flow, on its own line at the end of the message.
     The app re-renders its message list constantly, so both the button and its
     placement are re-asserted from a MutationObserver rather than once at load. */

  var MSG = ".__MSG__";          /* message_<hash> - one chat message wrapper */
  var USERMSG = ".__USERMSG__";  /* userMessage_<hash> - the user's text bubble */
  var ACTBTN = "__ACTBTN__";     /* the app's round message-actions button class */
  var ACTS = '[title="Message actions"]';
  var MD = ".__MD__";            /* root_<hash> - a rendered markdown span */
  var NOTTEXT = ".__THINK__,.__TOOLUSE__,.__TOOLRES__";   /* thinking / tool wrappers */
  var COPY_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  var DONE_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>';

  /* Copy the message's own text: for a user message that is the bubble, which
     excludes the actions container (and its popup) sitting inside the wrapper. */
  function textOf(m) {
    return ((m.querySelector(USERMSG) || m).innerText || "").trim();
  }

  /* clipboard.writeText is available in the webview; keep the execCommand path
     as a fallback for when the document is not focused / permission is denied. */
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(t).catch(function () { return legacyCopy(t); });
    }
    return legacyCopy(t);
  }

  function legacyCopy(t) {
    var ta = document.createElement("textarea");
    ta.value = t;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } finally { document.body.removeChild(ta); }
    return Promise.resolve();
  }

  function flash(b) {
    b.innerHTML = DONE_ICON;
    b.classList.add("__ccCopyOk");
    clearTimeout(b.__ccT);
    b.__ccT = setTimeout(function () {
      b.innerHTML = COPY_ICON;
      b.classList.remove("__ccCopyOk");
    }, 1200);
  }

  function onClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    var b = ev.currentTarget;
    var msg = b.closest(MSG);
    if (!msg) return;
    var t = textOf(msg);
    if (!t) return;
    copyText(t).then(function () { flash(b); }, function () {});
  }

  /* A click focuses the button, and the app's own actionButton rule includes
     :focus{opacity:1} - which would pin our icon on screen after a copy even
     once the pointer had left the message, while the app's button faded out.
     Suppressing the pointer's default focus keeps the two in lockstep;
     keyboard focus (Tab) is untouched and still reveals the button. */
  function keepFocusOffPointer(ev) {
    ev.preventDefault();
  }

  function make() {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "__ccCopy";
    b.title = "Copy message";
    b.setAttribute("aria-label", "Copy message");
    b.innerHTML = COPY_ICON;
    b.addEventListener("mousedown", keepFocusOffPointer);
    b.addEventListener("click", onClick);
    return b;
  }

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
