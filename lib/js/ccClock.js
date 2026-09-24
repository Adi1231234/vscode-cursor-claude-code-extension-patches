/* Shared webview runtime: the one clock, for things that show time on screen.

   State never needs a timer - the app pushes it (lib/js/ccSession.js) and the
   DOM pushes its changes (lib/js/ccWatch.js). A countdown or an elapsed-time
   label is different: the text changes because a second went by, and nothing
   pushes that. So there is exactly one periodic timer, it is here, and it is
   held to three rules:

     - it runs only while something is subscribed, i.e. while a clock is
       actually showing (a scheduled queue item, a live view, a running task),
       and stops by itself when the last one unsubscribes;
     - it does nothing while the panel is hidden, and restarts on the
       visibilitychange push rather than checking;
     - it ticks once a second, which is the finest thing any label here shows.

   Subscribers write through lib/js/ccDom.js, so a tick that changes no text
   writes nothing. tools/check-webview-runtime.mjs keeps setInterval out of
   every other webview file. */
window.__ccClock = window.__ccClock || (function () {
  var fns = [];
  var timer = 0;

  function arm() {
    if (timer || !fns.length || document.hidden) return;
    timer = setTimeout(tick, 1000);
  }

  function tick() {
    timer = 0;
    if (!fns.length || document.hidden) return;
    var now = Date.now(), list = fns.slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i].fn(now); } catch (e) {}
    }
    arm();
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (timer) { clearTimeout(timer); timer = 0; }
    } else {
      tick();
    }
  });

  /* fn(now) once a second while subscribed and visible. Returns a stop
     function; calling it twice is harmless. Each subscription is its own
     entry, so stopping one never removes another that passed the same fn. */
  function every(fn) {
    var sub = { fn: fn };
    fns.push(sub);
    arm();
    return function () {
      var i = fns.indexOf(sub);
      if (i >= 0) fns.splice(i, 1);
      if (!fns.length && timer) { clearTimeout(timer); timer = 0; }
    };
  }

  return { every: every };
})();
