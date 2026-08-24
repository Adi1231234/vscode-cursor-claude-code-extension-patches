
  /* ---------- The button itself ---------- */

  var COPY_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  var DONE_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>';

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
    window.__ccCopyText(t).then(function () { flash(b); }, function () {});
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
