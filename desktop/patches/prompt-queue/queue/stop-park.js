/* Stopping Claude parks the queue, as in the VS Code queue: a run you stopped is
   not a run that finished, so nothing queued should go out after it. On the busy
   signal a Stop looks exactly like a finish (the Stop button just leaves), so
   the click itself is the only place to tell them apart. We catch it on the
   capture phase, before the app handles it, and pause first. */
(function () {
    function onClick(e) {
        var t = e.target;
        if (!t || !t.closest || !t.closest('[data-testid="code-prompt-stop"]')) return;
        if (__ccq.count()) __ccq.setPaused(true);
    }
    window.__ccd.patch("prompt-queue-stop-park", function () {
        document.addEventListener("click", onClick, true);
    });
})();
