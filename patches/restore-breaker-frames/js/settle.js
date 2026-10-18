/* RESTOREFRAMES */
// The app's "did this conversation finish opening?" wait, the one its restore
// breaker (2.1.301) trusts. It waits for two animation frames and then its own
// delay (3 s) before marking an open as finished. An open still unmarked when
// the panel reloads counts against that conversation, and after two of them
// the tab opens a new, empty chat instead of the conversation.
//
// A visible panel whose renderer delivers no frames never gets those two, while
// its scripts run fine: measured on a window whose webview process had stopped
// compositing (requestAnimationFrame never fired in ten minutes), and on every
// background tab, whose iframe the editor hides while the document still says
// "visible". Each reload then counted against every open conversation, and the
// third one replaced six of them with empty chats.
//
// So the frames race a timer of the same delay. When no frame comes in that time
// but the timer still runs, the panel is alive and only not painting: the same case as
// a hidden document, which the app already settles without frames. A panel the
// conversation really froze runs neither the frames nor the timer, so the
// breaker still trips for it.
function __NAME__(done) {
  var frame, fallback, wait;

  function settle() {
    clearTimeout(fallback);
    frame = undefined;
    wait = setTimeout(done, __DELAY__);
  }

  if (document.visibilityState === "hidden") {
    settle();
  } else {
    frame = requestAnimationFrame(function () {
      frame = requestAnimationFrame(settle);
    });
    fallback = setTimeout(function () {
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (typeof window.__ccLog === "function") {
        window.__ccLog("restore", "no frame in " + __DELAY__ + " ms: the panel is not painting, " +
          "so this open is not counted as one that froze it");
      }
      settle();
    }, __DELAY__);
  }

  return function () {
    if (frame !== undefined) cancelAnimationFrame(frame);
    clearTimeout(fallback);
    clearTimeout(wait);
  };
}
