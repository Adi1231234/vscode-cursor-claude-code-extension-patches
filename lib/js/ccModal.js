/* Shared webview runtime: the chrome every dialog this repo injects wears.

   Overlay, head with its tinted medallion and close cross, foot, Escape and
   backdrop to dismiss, focus handed back where it came from, and Tab kept
   inside the box. Written once, against the app's own confirm-dialog family -
   see lib/css/ccModal.css, which carries the measured tokens and the class
   names used here.

   A caller builds only its own content, appends it to sh.box, and calls
   sh.mount(), which closes the foot behind it and arms the listeners. Exactly
   one modal is open at a time, so opening a second dismisses the first instead
   of stacking two overlays and two focus traps on top of each other.

   The class names stay the __q* ones this started life with in the prompt
   queue: they are what ccModal.css and three shipped dialogs already target,
   and renaming them would be churn with no reader on the other side.

   No backtick, no dollar-brace and no backslash anywhere in this file, comments
   included: prompt-queue injects it inside a template literal in extension.js,
   which would either break out of the string or eat the escape before the
   browser ever sees it. */
window.__ccModal = window.__ccModal || (function () {
  var _shellClose = null;

  function el(tag, cls) {
    var x = document.createElement(tag);
    if (cls) x.className = cls;
    return x;
  }

  function btn(cls, title) {
    var b = el("button", cls);
    b.type = "button";
    if (title) b.title = title;
    return b;
  }

  function focusables(box) {
    return [].slice.call(box.querySelectorAll("button,input,[tabindex]"))
      .filter(function (n) { return !n.disabled; });
  }

  function openShell(o) {
    if (_shellClose) _shellClose();
    var prevFocus = document.activeElement;
    var ov = el("div", "__qModalOv");
    var box = el("div", "__qModal" + (o.cls ? " " + o.cls : ""));
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", o.label || o.title || "Dialog");
    /* Head: a tinted medallion, then the title with a line of subtitle under
       it, then the close. The medallion is what turns "text and a cross" into
       a header - one accent-tinted square that says which dialog you are
       looking at before you read it. Callers that have nothing to add leave
       o.sub out and the line collapses (.__qSub:empty). */
    var head = el("div", "__qModalHead");
    var icon = el("span", "__qHeadIcon");
    var text = el("span", "__qHeadText");
    var title = el("span", "__qTitle");
    title.textContent = o.title || "";
    var sub = el("span", "__qSub");
    sub.textContent = o.sub || "";
    text.appendChild(title);
    text.appendChild(sub);
    var x = btn("__qClose", "Close (Esc)");
    x.textContent = "✕";
    if (o.icon) { icon.innerHTML = o.icon; head.appendChild(icon); }
    head.appendChild(text);
    head.appendChild(x);
    var foot = el("div", "__qModalFoot");

    function close() {
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      document.removeEventListener("keydown", onKey, true);
      if (_shellClose === close) _shellClose = null;
      try { prevFocus.focus(); } catch (e) {}
    }

    /* Capture phase: the app has body-level key handlers of its own, and Esc
       has to reach the dialog before them. The caller's onKey runs FIRST and
       can claim a key by returning true - which is how a dialog with a level
       inside it (a revealed field, a second view) makes Escape step back one
       level instead of always closing the whole thing. */
    function onKey(ev) {
      if (o.onKey && o.onKey(ev, close) === true) return;
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); return close(); }
      if (ev.key === "Tab") {
        var f = focusables(box);
        if (!f.length) return;
        var i = f.indexOf(ev.target), last = f.length - 1;
        if (ev.shiftKey && i <= 0) { ev.preventDefault(); f[last].focus(); }
        else if (!ev.shiftKey && i === last) { ev.preventDefault(); f[0].focus(); }
      }
    }

    function mount() {
      box.appendChild(foot);
      ov.appendChild(box);
      document.body.appendChild(ov);
      document.addEventListener("keydown", onKey, true);
      _shellClose = close;
    }

    x.addEventListener("click", close);
    ov.addEventListener("click", function (ev) { if (ev.target === ov) close(); });
    box.appendChild(head);
    return { ov: ov, box: box, head: head, icon: icon, title: title, sub: sub, foot: foot, close: close, mount: mount };
  }

  return openShell;
})();
