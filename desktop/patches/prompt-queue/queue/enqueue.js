/* While a turn is running, Enter adds the composer's text to the queue instead
   of being swallowed - the Codex-style "line up the next message" gesture. We
   catch it on the capture phase, ahead of ProseMirror's own Enter handling, and
   only while busy; idle Enter is left alone so a normal send is untouched.
   Shift+Enter (newline) and IME composition are never intercepted. */
(function () {
    function onKeydown(e) {
        if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
        if (!__ccqBusy.busy()) return;                  // idle: let the app send
        var i = __ccq.composer.input();
        if (!i || !(e.target === i || i.contains(e.target))) return;
        var t = __ccq.composer.text();
        if (!t) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        __ccq.add(t);
        __ccq.composer.clear();
    }
    window.__ccd.patch("prompt-queue-enqueue", function () {
        document.addEventListener("keydown", onKeydown, true);
    });
})();
