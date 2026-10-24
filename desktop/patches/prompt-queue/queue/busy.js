/* The run-state signal for the Code tab, as a push.

   Busy is told from the DOM: while a turn runs, the composer's send button is a
   Stop button (`[data-testid="code-prompt-stop"]`); when the whole turn is done
   it returns to Send. That control stays Stop for the entire turn - through every
   subagent and tool call - so a rising-then-falling pair is one real run, and a
   "finish" never fires while a subagent is still working. That is exactly the
   "only when Claude truly finished" rule, read off the app's own UI.

   We piggyback on the one shared observer (__ccWatch) rather than polling: the
   send/stop swap is a childList change it already delivers. */
window.__ccqBusy = (function () {
    var subs = { start: [], finish: [] };
    function isBusy() { return !!document.querySelector('[data-testid="code-prompt-stop"]'); }
    var busy = isBusy();
    function emit(ev) { subs[ev].slice().forEach(function (f) { try { f(); } catch (e) {} }); }
    function check() {
        var now = isBusy();
        if (now === busy) return;
        busy = now;
        emit(now ? "start" : "finish");
    }
    __ccWatch.on(check);
    return {
        busy: function () { return busy; },
        on: function (ev, fn) { if (subs[ev]) subs[ev].push(fn); },
    };
})();
