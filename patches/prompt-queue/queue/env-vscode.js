  /* ---------- The surface: where this queue meets the VS Code panel ----------
     Everything the queue knows about the panel it runs in - how the composer
     reads and is written, where the panel, the footer buttons and the
     attachment chips are - is here and nowhere else, so the same queue runs in
     another surface by swapping this one file
     (desktop/patches/prompt-queue/host/env-desktop.js is the Claude Desktop
     app's). */
  var BUSY = "Queue another message";   /* the composer's placeholder mid-turn */
  var PVH = "__PVHASH__";               /* the app's image-preview module hash */

  /* This panel's composer, session store and session pushes, and where the
     queue publishes its surfaces for other patches: one panel, one queue, so
     the shared runtimes (lib/js/ccStore.js, ccSession.js) and window. The
     desktop app runs a queue per conversation and answers these per queue. */
  function composerEl() { return globalThis.__ccInput(); }
  function sessionStore() { return globalThis.__ccStore(); }
  function sessionPush() { return window.__ccSession; }
  function expose(name, api) { window[name] = window[name] || api; return window[name]; }

  /* The draft as plain text. */
  function composerText(e) {
    return e.textContent || "";
  }

  function setText(e, t) {
    e.textContent = t;
    e.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }

  /* Send what the composer holds, through the app's own submit. */
  function submitComposer(e) {
    var f = e.closest("form");
    if (f && f.requestSubmit) f.requestSubmit();
    else e.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", ctrlKey: true, bubbles: true, cancelable: true }));
  }

  /* A turn is running, read off the composer - only when no session is found. */
  function composerBusy(e) {
    return (e.getAttribute("data-placeholder") || "").indexOf(BUSY) === 0;
  }

  /* An @-mention or slash menu is open over the composer: Alt+Enter is its. */
  function suggestionsOpen() {
    return !!qs('[class*="popupVisible"],[class*="suggestions_"]');
  }

  /* The panel sits just above this node. */
  function panelAnchor(e) {
    return e.closest('[class*="messageInputContainer_"]') || e.parentNode;
  }

  /* The region whose changes mean the app re-rendered the composer. */
  function composerArea() {
    var e = inp(), form = e && e.closest("form");
    return form ? form.parentElement : null;
  }

  /* The footer the queue's buttons join: root (searched for our own buttons)
     and send (they are placed just before it). Null when it is not drawn. */
  function footerOf(e) {
    var form = e.closest("form");
    var send = form && form.querySelector('[class*="sendButton"]');
    return send && send.parentNode ? { root: form, send: send } : null;
  }

  /* The attachment chips in the composer: their box, one chip's file name, and
     the first chip's remove button. */
  function chipBox() {
    return qs('[class*="attachedFilesContainer"]');
  }

  function chipName(chip) {
    var lbl = chip.querySelector('[class*="label"]');
    return (lbl && (lbl.getAttribute("title") || lbl.textContent)) || "file";
  }

  function chipRemoveButton() {
    return qs('[class*="attachedFilesContainer"] [class*="removeButton"]');
  }

  /* The app reads every attached file through FileReader.readAsDataURL, so
     that is where a file and its data URL are both in hand. */
  function hookAttachments() {
    try {
      var FR = window.FileReader;
      if (!FR || !FR.prototype || FR.prototype.__qHook) return;
      var orig = FR.prototype.readAsDataURL;
      FR.prototype.readAsDataURL = function (blob) {
        try {
          if (blob && blob.name) {
            var self = this;
            this.addEventListener("load", function () {
              try { fileStore[blob.name] = { file: blob, dataUrl: self.result }; } catch (e) {}
            }, { once: true });
          }
        } catch (e) {}
        return orig.apply(this, arguments);
      };
      FR.prototype.__qHook = 1;
    } catch (e) {}
  }

  /* The image preview borrows the app's own preview styles. */
  var PREVIEW = {
    overlay: "previewOverlay_" + PVH, box: "previewContainer_" + PVH,
    image: "previewImage_" + PVH, close: "previewCloseButton_" + PVH
  };
