/* Reading and driving the composer - the one place that touches the editor.
   The editor is a tiptap ProseMirror contenteditable; execCommand drives its
   beforeinput path, which it honours (verified live). Sending a queued item
   clears the field, inserts the text, then clicks the app's own Send button, so
   submission goes through the app's real path rather than a synthesised event. */
(function () {
    function input() { return document.querySelector('[data-testid="code-prompt-input"]'); }
    function sendBtn() { return document.querySelector('[data-testid="code-prompt-send"]'); }

    __ccq.composer = {
        input: input,
        sendButton: sendBtn,
        text: function () { var i = input(); return i ? (i.innerText || "").trim() : ""; },
        isEmpty: function () { return __ccq.composer.text() === ""; },
        clear: function () {
            var i = input();
            if (i) { i.focus(); document.execCommand("selectAll", false); document.execCommand("delete", false); }
        },
        insert: function (s) { var i = input(); if (i) { i.focus(); document.execCommand("insertText", false, s); } },
        // clear + insert, then click Send once the button has enabled (one-shot,
        // not a poll). Returns false if the editor is missing.
        send: function (s) {
            var i = input();
            if (!i) return false;
            __ccq.composer.clear();
            __ccq.composer.insert(s);
            setTimeout(function () { var b = sendBtn(); if (b) b.click(); }, 80);
            return true;
        },
    };
})();
