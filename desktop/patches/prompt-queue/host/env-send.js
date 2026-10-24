  /* ---------- The surface, desktop: sending what the composer holds ---------- */

  /* Enter, as the person would press it: the app sends, mid-turn included.
     Two things measured on the live composer. The editor reads what
     execCommand wrote from its own MutationObserver, so an Enter in the same
     task as setText sends the editor's old, empty state - nothing happens and
     the text stays put; one task later it sends. And the app empties the
     composer when it takes a message and only then shows Stop (measured:
     "cleared, idle" for a moment, then "cleared, busy"), so:
       - the text still there afterwards means it was not sent: that throws,
         and the queue keeps the item (flush-init.js puts it back, retries);
       - the send is done once the turn shows as running. Done any earlier,
         the queue's next pass would read "idle" in that moment and send the
         next item straight after this one.
     A message taken without a turn showing (none came within the wait) is
     still sent: the composer took it. */
  var SEND_WAIT_MS = 3000;

  function whenTaken(e) {
    function cleared() { return !composerText(e).trim(); }
    return new Promise(function (resolve, reject) {
      if (cleared() && composerBusy()) { resolve(); return; }
      var stop = null, timer = setTimeout(function () {
        stop();
        if (cleared()) resolve(); else reject(new Error("the composer kept the text: not sent"));
      }, SEND_WAIT_MS);
      stop = window.__ccWatch.on(function () {
        if (!cleared() || !composerBusy()) return;
        clearTimeout(timer);
        stop();
        resolve();
      }, { chars: true });
    });
  }

  async function submitComposer(e) {
    await delay(0);
    e.focus();
    e.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    await whenTaken(e);
  }
