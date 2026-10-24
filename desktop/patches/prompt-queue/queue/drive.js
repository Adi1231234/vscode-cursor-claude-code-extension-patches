/* Sends the next queued item the moment the current turn truly ends. "Truly" is
   the whole point: __ccqBusy only reports finished when the Stop button is gone,
   which the app keeps up through every subagent, so a queued item never goes out
   while work is still running.

   One item per finish. We do not drop an item until the send is confirmed by the
   next "start" edge; if the turn never starts (a failed send) we release and
   retry on the following finish. A user draft in the composer is never
   clobbered - we wait until the field is clear. */
(function () {
    var inflight = false;
    var firedAt = 0;

    function maybeFire() {
        if (inflight || __ccqBusy.busy()) return;
        if (__ccq.paused() || !__ccq.count()) return;
        if (!__ccq.composer.isEmpty()) return;          // leave a user draft alone
        var next = __ccq.list()[0];
        if (next == null) return;
        inflight = true;
        firedAt = Date.now();
        if (!__ccq.composer.send(next)) { inflight = false; }
    }

    __ccqBusy.on("start", function () {
        if (inflight) { __ccq.shift(); inflight = false; }   // our send took
    });
    __ccqBusy.on("finish", function () {
        if (inflight && Date.now() - firedAt > 3000) inflight = false;  // send never started; retry
        setTimeout(maybeFire, 150);
    });

    window.__ccd.patch("prompt-queue-drive", function () {
        setTimeout(maybeFire, 500);   // kick once if we load idle with items queued
        __ccq.onChange(function () { if (!__ccqBusy.busy()) setTimeout(maybeFire, 50); });
    });
})();
