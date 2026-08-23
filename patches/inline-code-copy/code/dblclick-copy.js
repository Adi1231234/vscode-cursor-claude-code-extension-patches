
  /* ---------- Feedback ---------- */

  /* Select the whole chip, so it is visible exactly what went to the clipboard -
     the double-click on its own would have selected just one word of it. */
  function selectWhole(node) {
    try {
      var r = document.createRange();
      r.selectNodeContents(node);
      var s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    } catch (e) {}
  }

  function ring(node) {
    node.classList.add(RING);
    clearTimeout(node.__ccCodeT);
    node.__ccCodeT = setTimeout(function () { node.classList.remove(RING); }, RING_MS);
  }

  /* Body-mounted and fixed: anything added inside the message list changes its
     height a frame after the app has pinned the scroll (see the root CLAUDE.md),
     which shows up as the transcript jumping. */
  var _toast = null, _toastT = null;

  function dropToast() {
    if (!_toast) return;
    clearTimeout(_toastT);
    if (_toast.parentNode) _toast.parentNode.removeChild(_toast);
    _toast = null;
  }

  function place(t, node) {
    var r = node.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight;
    var left = r.left + (r.width - w) / 2;
    if (left + w > window.innerWidth - 4) left = window.innerWidth - 4 - w;
    if (left < 4) left = 4;
    var top = r.top - h - 6;
    if (top < 4) top = r.bottom + 6;
    t.style.left = left + "px";
    t.style.top = top + "px";
  }

  function toast(node) {
    dropToast();
    var t = document.createElement("div");
    t.className = "__ccCodeToast";
    t.textContent = "Copied";
    document.body.appendChild(t);
    place(t, node);
    _toast = t;
    _toastT = setTimeout(function () {
      t.classList.add("__ccCodeToastOut");
      _toastT = setTimeout(dropToast, FADE_MS);
    }, TOAST_MS);
  }

  /* ---------- The handler ---------- */

  function inlineCodeAt(target) {
    if (!target || !target.closest) return null;
    var code = target.closest("code");
    if (!code || code.closest("pre") || !code.closest(MSGS)) return null;
    return code;
  }

  /* Capture so nothing can swallow it first, but neither preventDefault nor
     stopPropagation: the app keeps its own double-click behaviour untouched. */
  document.addEventListener("dblclick", function (ev) {
    var code = inlineCodeAt(ev.target);
    if (!code) return;
    var text = (code.innerText || "").trim();
    if (!text) return;
    window.__ccCopyText(text).then(function () {
      selectWhole(code);
      ring(code);
      toast(code);
    }, function () {});
  }, true);

  /* A stale toast would sit over the wrong place once the view moves. */
  window.addEventListener("scroll", dropToast, true);
  window.addEventListener("resize", dropToast);
})();</script>
