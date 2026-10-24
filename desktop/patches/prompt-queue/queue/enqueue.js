/* Adding to the queue is opt-in only, exactly as in the VS Code queue: plain
   Enter and the app's Send button are never touched, they send as normal. The
   only gestures that enqueue are Alt+Enter in the composer and the add-to-queue
   button beside Send (add-button.js), and both go through commitDraft here.

   Idle-hold: an add while Claude is idle parks the queue first, so it does not
   drain at once - you build a batch and release it with the panel's Resume.
   Pause is set BEFORE the item lands, so the driver never sees an unpaused,
   non-empty queue in between. An add while busy leaves it draining after the
   turn. Shift+Enter and IME composition are never intercepted. */
(function () {
    __ccq.commitDraft = function () {
        var t = __ccq.composer.text();
        if (!t) return false;
        if (!__ccqBusy.busy()) __ccq.setPaused(true);
        __ccq.add(t);
        __ccq.composer.clear();
        return true;
    };

    function onKeydown(e) {
        if (e.key !== "Enter" || !e.altKey || e.shiftKey || e.isComposing) return;
        var i = __ccq.composer.input();
        if (!i || !(e.target === i || i.contains(e.target))) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        __ccq.commitDraft();
    }

    window.__ccd.patch("prompt-queue-enqueue", function () {
        document.addEventListener("keydown", onKeydown, true);
    });
})();
