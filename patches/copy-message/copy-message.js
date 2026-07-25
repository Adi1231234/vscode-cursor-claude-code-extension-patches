<script nonce="${__NONCE__}">/* COPYMSG */(function(){
  /* A copy-to-clipboard icon at the end of every chat message (user and
     assistant alike). The app re-renders its message list constantly, so the
     button is (re)attached from a MutationObserver rather than once at load. */

  var MSG = ".__MSG__";   /* message_<hash> - the wrapper of a single chat message */
  var COPY_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  var DONE_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>';

  /* The button holds only an <svg>, which innerText ignores - so the message
     text needs no filtering. */
  function textOf(msg) {
    return (msg.innerText || "").trim();
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
    var msg = b.parentNode;
    if (!msg) return;
    var t = textOf(msg);
    if (!t) return;
    copyText(t).then(function () { flash(b); }, function () {});
  }

  function make() {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "__ccCopy";
    b.title = "Copy message";
    b.setAttribute("aria-label", "Copy message");
    b.innerHTML = COPY_ICON;
    b.addEventListener("click", onClick);
    return b;
  }

  function ensure() {
    document.querySelectorAll(MSG).forEach(function (m) {
      if (m.querySelector(":scope > .__ccCopy")) return;
      if (!textOf(m)) return;            /* nothing to copy yet - retry on the next mutation */
      m.appendChild(make());
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
