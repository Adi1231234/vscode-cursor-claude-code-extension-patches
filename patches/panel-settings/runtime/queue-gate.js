/* Is more work already lined up behind this run?

   A queue of five prompts is one piece of work, not five, so the moment worth
   announcing is the end of it. The prompt-queue patch publishes exactly what is
   needed on `window.__qAuto`: `count()`, which already excludes parked items,
   and `paused()`. Nothing is reached into - that surface is the queue's own
   export, the one auto-followup reads too.

   Paused counts as nothing pending on purpose: a held queue will not send
   anything, so this run really was the last one and staying silent would mean
   never notifying at all. Same for a panel where the queue patch is not
   installed, or where anything here throws: no queue, so nothing to wait for.

   The count is trustworthy at this instant because this runs synchronously on
   the signal falling, and the queue hears the same fall later - through
   lib/js/ccSession.js (a microtask) and then its own pass (a task) - so the
   next item cannot already have left the queue. */
function __ccSettingsQueuePending() {
    try {
        var queue = window.__qAuto;
        if (!queue || typeof queue.count !== "function") return false;
        if (typeof queue.paused === "function" && queue.paused()) return false;
        return queue.count() > 0;
    } catch (e) {
        return false;
    }
}
