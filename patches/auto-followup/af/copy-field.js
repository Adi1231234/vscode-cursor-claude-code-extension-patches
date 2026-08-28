  /* ---------- Copying a field ----------

     One icon, on every box in the responder editor, that puts what is in the
     field on the clipboard. These are the things people move between machines
     and paste into a chat to ask about, and selecting a textarea's whole
     contents by hand is the kind of small friction nobody reports and everybody
     works around.

     The clipboard call is the shared one from lib/js: writeText is granted in
     the webview but rejects when the document is not focused, so it falls back
     to a hidden textarea and execCommand. Nothing here reimplements that. */

  var COPY_SVG =
    '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
    'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/>' +
    '<path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/>' +
    '</svg>';

  /* read is a function, not a value: the button is built once when the pane is
     drawn and pressed later, by which time the field has been typed into. */
  function copyBtn(read, label) {
    var b = el("span", "__afCopy");
    b.innerHTML = COPY_SVG;
    b.setAttribute("aria-label", "Copy " + (label || "this"));
    b.setAttribute("title", "Copy");
    press(b, function () {
      var text = String(read() || "");
      if (!text) return;                      /* nothing to copy is not a copy */
      try { window.__ccCopyText(text); } catch (e) {}
      /* Said on the button rather than anywhere else, because the button is
         where the eye already is, and gone again on its own. */
      b.className = "__afCopy __afCopied";
      var was = b.innerHTML;
      b.innerHTML = "";
      txt(b, "copied");
      setTimeout(function () {
        if (!b.parentNode) return;
        b.className = "__afCopy";
        b.innerHTML = was;
      }, 1100);
    }, "button");
    return b;
  }
