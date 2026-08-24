
  /* ---------- Boot ----------
     One window listener carries both directions: the app's own host envelope
     ("from-extension", which wraps every SDK message) and our private channel.
     The app only reacts to the first, so this is purely additive. */

  window.addEventListener("message", function (ev) {
    var d = ev && ev.data;
    if (!d || typeof d !== "object") return;
    if (d.type === CH) { try { onHostMessage(d); } catch (e) {} return; }
    if (d.type !== "from-extension") return;
    var m = d.message;
    if (!m || m.type !== "io_message") return;
    try { onSdk(m.message); } catch (e) {}
  });

  /* React re-renders the composer footer, so the indicator is re-anchored from the
     same mutation that dropped it, not from a timer. */
  try {
    new MutationObserver(function () { changed(); }).observe(document.body, { childList: true, subtree: true });
  } catch (e) {}

  /* The only clock in here: elapsed times would otherwise freeze between events. */
  setInterval(function () {
    try { if (back || runningCount()) changed(); } catch (e) {}
  }, 1000);

  resetPane();
})();</script>
