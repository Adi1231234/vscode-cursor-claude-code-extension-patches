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

/* The one message this patch sends, through runtime/hostlink.js. */
function __ccSettingsNotifyHost(session) {
    var skipWhenFocused = __ccSettingsGet("skipWhenFocused") === true;
    var sent = __ccSettingsSend(session, {
        type: "__ccnotify",
        op: "done",
        title: "Claude finished",
        body: __ccSettingsSessionLabel(session),
        /* Whether the window is focused is a fact only the host can read - the
           panel is an iframe and document.hasFocus() answers a different
           question, about the panel rather than the window. So the setting
           travels with the message and the host applies it. */
        skipWhenFocused: skipWhenFocused
    });
    if (!sent) {
        __ccSettingsNote("lost", "no host connection to send on");
        return;
    }
    /* The gates are applied in the host, so "sent" is not the same as "shown" -
       say so here, or a reader chasing a silence sees `sent` and concludes the
       message was lost when in fact the host deliberately swallowed it. The
       host's own answer follows under the `host` tag, and its absence is the
       one failure the panel cannot see from anywhere else. */
    __ccSettingsNote("sent", __ccSettingsSessionLabel(session) +
        (skipWhenFocused ? " (the host decides, on focus)" : ""));
    __ccSettingsAfterReply(function (answered) {
        if (!answered) __ccSettingsNote("host", "no answer. " + __ccSettingsStaleText());
    });
}
