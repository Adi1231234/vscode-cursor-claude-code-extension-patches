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
            return;
        }
        if (!__ccSettingsGet("notifyOnFinish")) return;
        __ccSettingsNotifyHost(session);
    }

    setTimeout(function () {
        try {
            session.busy.subscribe(function (busy) {
                if (wasBusy === null) {
                    wasBusy = !!busy;
                    return;
                }
                if (wasBusy && !busy) finished();
                wasBusy = !!busy;
            });
        } catch (e) {}
    }, 0);
}

/* The one message this patch sends. connection.value is the app's own host
   back-channel - the same one every other injected patch here uses, and the
   reason none of them goes anywhere near acquireVsCodeApi. */
function __ccSettingsNotifyHost(session) {
    try {
        var connection = session.connection && session.connection.value;
        if (!connection || typeof connection.send !== "function") return;
        connection.send({
            type: "__ccnotify",
            op: "done",
            title: "Claude finished",
            body: __ccSettingsSessionLabel(session)
        });
    } catch (e) {}
}

/* What the toast says underneath the title: the conversation's own summary if
   it has one yet, else the folder it is running in, else nothing. A toast that
   only says "Claude finished" is useless with three windows open.

   `unwrap` because these fields are signals, but not uniformly across versions
   - reading .value off a plain string would quietly yield undefined and cost
   the toast its only identifying line. The backslash is built rather than
   written: this file is prepended to webview/index.js today, where a literal
   one would be fine, but every other injected script in this repo lives inside
   a template literal that would eat it, and the idiom should not differ per
   file. */
function __ccSettingsSessionLabel(session) {
    try {
        var summary = __ccSettingsUnwrap(session.summary);
        if (summary) return String(summary);
        var cwd = __ccSettingsUnwrap(session.cwd);
        if (cwd) {
            var parts = String(cwd).split(String.fromCharCode(92)).join("/").split("/").filter(Boolean);
            return parts.length ? parts[parts.length - 1] : "";
        }
    } catch (e) {}
    return "";
}

function __ccSettingsUnwrap(field) {
    if (field === null || field === undefined) return undefined;
    if (typeof field === "object" && "value" in field) return field.value;
    return field;
}
