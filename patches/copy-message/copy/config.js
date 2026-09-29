<script nonce="${__NONCE__}">/* COPYMSG */(function(){
  /* A copy-to-clipboard icon on every message YOU sent. Claude's replies are
     not decorated: the app draws its own "Copy response" button on those since
     2.1.278, and it has no copy for the user's own message. Two placements:
       - normally: inside the app's own "Message actions" container, next to
         the round rewind/fork button, wearing the app's actionButton class so
         it inherits that look and hover reveal exactly;
       - where the app draws no such container (a read-only transcript, a held
         message): normal flow, on its own line at the end of the message.
     The app re-renders its message list constantly, so both the button and its
     placement are re-asserted from a MutationObserver rather than once at load.
     Sections: config (here), the shared clipboard runtime, button,
     placement + observer. */

  var MSG = ".__MSG__";          /* message_<hash> - one chat message wrapper */
  var USERMSG = ".__USERMSG__";  /* userMessage_<hash> - the user's text bubble */
  var ACTBTN = "__ACTBTN__";     /* the app's round message-actions button class */
  var ACTS = '[title="Message actions"]';

  /* The message's own text lives in the bubble, which excludes the actions
     container (and its popup) sitting inside the wrapper. null for anything
     that is not a user message. */
  function bodyOf(m) {
    return m.querySelector(USERMSG);
  }

  /* What actually gets copied. innerText, deliberately: it is the rendered text,
     so the blank lines between blocks survive the trip to the clipboard. */
  function textOf(m) {
    var b = bodyOf(m);
    return b ? (b.innerText || "").trim() : "";
  }

  /* Only asks whether there is anything at all to copy, and uses textContent for
     it. innerText is defined in terms of rendered layout, so every read flushes
     pending style and layout synchronously; textContent reads the tree and forces
     nothing, and this is asked from the observer pass on every burst. */
  function hasText(m) {
    var b = bodyOf(m);
    return !!b && !!(b.textContent || "").trim();
  }
