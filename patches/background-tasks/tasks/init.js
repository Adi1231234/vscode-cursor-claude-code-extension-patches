
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

  /* React re-renders the composer footer, so the indicator is re-anchored from
     the same change that dropped it, not from a timer - through the shared
     observer (lib/js/ccWatch.js), which never hands back a change this patch or
     another one made to its own nodes. That is what used to let the dialog's
     own redraw wake the pass that redraws it.

     Scoped to the composer's container: the footer row lives there, and a
     streamed reply elsewhere in the panel has nothing to say about it. The
     container rather than the form, so a form mounted into it is seen too. A
     conversation switch replaces the composer wholesale, so that arrives as a
     session push (lib/js/ccSession.js) - which is also the first moment there
     is a composer to anchor to at all. */
  window.__ccWatch.on(function () { changed(); }, {
    scope: function () {
      var e = inp();
      var form = e && e.closest ? e.closest("form") : null;
      return form ? form.parentElement : null;
    }
  });
  window.__ccSession.onStore(function () { changed(); });

  resetPane();
})();</script>
