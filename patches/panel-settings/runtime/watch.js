/* "The run finished" - watched, not polled.

   `session.busy` is a Preact signal, and a signal carries .subscribe(), so the
   falling edge arrives as a push. Nothing here runs on a timer. (The queue and
   the auto-followup patches predate this and poll `busy` at 150/300ms; they
   need a settled *reply*, which is a different question from "did the turn
   end".)

   Two facts make the edge trustworthy. `busy` is set true once, on the SDK's
   `system`/`init` frame, and back to false only in the store's own endTurn(),
   which runs on the `result` frame - so it does not flap between tool calls
   inside one turn, and a rising-then-falling pair really is one run. And the
   first value .subscribe() hands back is the *current* one rather than a
   change, so the first callback only primes `wasBusy` and can never be read as
   an edge - otherwise opening a panel mid-run would announce a finish.

   Pressing Stop ends a run too, and `busy` cannot tell the two apart: it goes
   false either way. The store's interrupt() is what the Stop button calls, and
   it runs synchronously with the click, before the signal flips - so wrapping
   it is enough to mark the next edge as one the user caused and swallow it.
   Someone who just stopped a run does not need to be told it stopped.

   The store object is replaced whenever the conversation changes, which is why
   this is wired from inside the footer's render (see gear-call.js) rather than
   once at load: that render re-runs with the new object. The marker keeps it to
   one wiring per store, and the wiring itself is deferred off the render pass,
   since subscribing creates an effect and a render is no place for one. */
function __ccSettingsWatch(session) {
    if (!session || session.__ccNotifyWatched) return;
    if (!session.busy || typeof session.busy.subscribe !== "function") return;
    session.__ccNotifyWatched = 1;

    var wasBusy = null;
    var userStopped = false;

    var previousInterrupt = session.interrupt;
    if (typeof previousInterrupt === "function") {
        session.interrupt = function () {
            userStopped = true;
            return previousInterrupt.apply(this, arguments);
        };
    }

    function finished() {
        if (userStopped) {
            userStopped = false;
            __ccSettingsNote("quiet", "the user pressed Stop");
            return;
        }
        if (!__ccSettingsGet("notifyOnFinish")) {
            __ccSettingsNote("quiet", "notifyOnFinish is off");
            return;
        }
        if (__ccSettingsGet("waitForQueue") && __ccSettingsQueuePending()) {
            __ccSettingsNote("quiet", "queue still has work");
            return;
        }
        __ccSettingsNotifyHost(session);
    }

    setTimeout(function () {
        try {
            session.busy.subscribe(function (busy) {
                if (wasBusy === null) {
                    wasBusy = !!busy;
                    __ccSettingsNote("armed", "busy=" + !!busy);
                    return;
                }
                if (wasBusy && !busy) {
                    __ccSettingsNote("edge", "run ended");
                    finished();
                }
                wasBusy = !!busy;
            });
        } catch (e) {
            __ccSettingsNote("broken", "subscribe failed: " + (e && e.message));
        }
    }, 0);
}

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

   The 150ms flush tick is what makes the count trustworthy at this instant. The
   next item cannot already have left the queue, because this runs synchronously
   on the signal falling and that tick has not come round yet. */
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

/* The one message this patch sends. connection.value is the app's own host
   back-channel - the same one every other injected patch here uses, and the
   reason none of them goes anywhere near acquireVsCodeApi. */
function __ccSettingsNotifyHost(session) {
    try {
        var connection = session.connection && session.connection.value;
        if (!connection || typeof connection.send !== "function") {
            __ccSettingsNote("lost", "no host connection to send on");
            return;
        }
        /* The focus gate is applied in the host, so "sent" is not the same as
           "shown" while it is on - say so here, or a reader chasing a silence
           sees `sent` and concludes the message was lost when in fact the host
           deliberately swallowed it. */
        var skipWhenFocused = __ccSettingsGet("skipWhenFocused") === true;
        __ccSettingsNote("sent", __ccSettingsSessionLabel(session) +
            (skipWhenFocused ? " (host stays quiet if this window is focused)" : ""));
        connection.send({
            type: "__ccnotify",
            op: "done",
            title: "Claude finished",
            body: __ccSettingsSessionLabel(session),
            /* Whether the window is focused is a fact only the host can read -
               the panel is an iframe and document.hasFocus() answers a
               different question, about the panel rather than the window. So
               the setting travels with the message and the host applies it. */
            skipWhenFocused: skipWhenFocused
        });
    } catch (e) {
        __ccSettingsNote("lost", "send threw: " + (e && e.message));
    }
}
