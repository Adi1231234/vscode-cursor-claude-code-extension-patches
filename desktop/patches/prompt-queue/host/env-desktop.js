  /* ---------- The surface: where this queue meets the Desktop Code tab ----------
     The desktop twin of patches/prompt-queue/queue/env-vscode.js: the same
     functions, read off the Code tab's composer. Everything here was measured
     on the live page (claude.ai/code renders the same composer):
       - the editor is a tiptap ProseMirror, [data-testid=code-prompt-input];
         execCommand drives it through its own input path
       - the composer is [data-cds=ChatComposer]; its buttons sit in
         [data-testid=code-prompt-trailing-controls], Send in
         [data-testid=code-prompt-send-cell]
       - an open / or @ menu leaves tiptap's .suggestion decoration in the editor
       - an attachment is a [data-cds^=MessageAttachments] tile whose remove
         button is labelled "Remove <file name>"; its preview is a blob: URL,
         so the file itself is caught on its way in (hookAttachments). */
  var STOP = '[data-testid="code-prompt-stop"]';

  function composer(e) {
    return e && e.closest('[data-cds="ChatComposer"]');
  }

  /* One line per paragraph. innerText puts a blank line between paragraphs
     (measured: two typed lines read "a\n\nb"), which setText would then turn
     into an empty paragraph of its own, one more on every round trip. */
  function composerText(e) {
    var NL = String.fromCharCode(10), blocks = e.children;
    if (!blocks.length) return e.innerText || "";
    var lines = [];
    for (var i = 0; i < blocks.length; i++) {
      var t = blocks[i].innerText || "";
      lines.push(t.charAt(t.length - 1) === NL ? t.slice(0, -1) : t);
    }
    return lines.join(NL);
  }

  /* Each line its own paragraph, as typing it would make. */
  function setText(e, t) {
    e.focus();
    document.execCommand("selectAll", false);
    document.execCommand("delete", false);
    String(t || "").split(String.fromCharCode(10)).forEach(function (line, i) {
      if (i) document.execCommand("insertParagraph", false);
      if (line) document.execCommand("insertText", false, line);
    });
  }

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

  function composerBusy() {
    return !!qs(STOP);
  }

  function suggestionsOpen() {
    var e = inp();
    return !!(e && e.querySelector(".suggestion"));
  }

  function panelAnchor(e) {
    return composer(e) || e.parentNode;
  }

  function composerArea() {
    var c = composer(inp());
    return c ? c.parentElement : null;
  }

  function footerOf(e) {
    var c = composer(e);
    var send = c && c.querySelector('[data-testid="code-prompt-send-cell"]');
    return send && send.parentNode ? { root: c, send: send } : null;
  }

  function chipBox() {
    var c = composer(inp());
    var tile = c && c.querySelector('[data-cds^="MessageAttachments"]');
    return tile ? tile.parentElement : null;
  }

  function chipRemoveButton() {
    var c = composer(inp());
    return c && c.querySelector('button[aria-label^="Remove "]');
  }

  function chipName(chip) {
    var b = chip.querySelector('button[aria-label^="Remove "]');
    return b ? b.getAttribute("aria-label").slice(7) : "file";
  }

  /* The app keeps attachments as blob: URLs read in the page's own world,
     where we cannot hook. Every file reaches it through a paste, a drop or a
     file picker, and those events carry the File objects to us too. */
  function hookAttachments() {
    function keep(list) {
      for (var i = 0; list && i < list.length; i++) {
        if (list[i] && list[i].name) fileStore[list[i].name] = { file: list[i], dataUrl: null };
      }
    }
    document.addEventListener("paste", function (ev) { keep(ev.clipboardData && ev.clipboardData.files); }, true);
    document.addEventListener("drop", function (ev) { keep(ev.dataTransfer && ev.dataTransfer.files); }, true);
    document.addEventListener("change", function (ev) {
      var t = ev.target;
      if (t && t.type === "file") keep(t.files);
    }, true);
  }

  /* The app's own preview is not ours to borrow: desktop.css styles these. */
  var PREVIEW = { overlay: "__qPvOverlay", box: "__qPvBox", image: "__qPvImage", close: "__qPvClose" };
