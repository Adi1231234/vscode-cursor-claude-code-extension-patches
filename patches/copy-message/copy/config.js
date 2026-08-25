<script nonce="${__NONCE__}">/* COPYMSG */(function(){
  /* A copy-to-clipboard icon for every chat message. Two placements:
       - user messages: inside the app's own "Message actions" container, next
         to the round rewind/fork button, wearing the app's actionButton class
         so it inherits that look and hover reveal exactly;
       - everything else: normal flow, on its own line at the end of the message.
     The app re-renders its message list constantly, so both the button and its
     placement are re-asserted from a MutationObserver rather than once at load.
     Sections: config (here), the shared clipboard runtime, button,
     placement + observer. */

  var MSG = ".__MSG__";          /* message_<hash> - one chat message wrapper */
  var USERMSG = ".__USERMSG__";  /* userMessage_<hash> - the user's text bubble */
  var ACTBTN = "__ACTBTN__";     /* the app's round message-actions button class */
  var ACTS = '[title="Message actions"]';
  var MD = ".__MD__";            /* root_<hash> - a rendered markdown span */
  var NOTTEXT = ".__THINK__,.__TOOLUSE__,.__TOOLRES__";   /* thinking / tool wrappers */

  /* The message's own text lives here: for a user message that is the bubble,
     which excludes the actions container (and its popup) sitting inside the
     wrapper. */
  function bodyOf(m) {
    return m.querySelector(USERMSG) || m;
  }

  /* What actually gets copied. innerText, deliberately: it is the rendered text,
     so the blank lines between blocks survive the trip to the clipboard. */
  function textOf(m) {
    return (bodyOf(m).innerText || "").trim();
  }

  /* Only asks whether there is anything at all to copy, and uses textContent for
     it. innerText is defined in terms of rendered layout, so every read flushes
     pending style and layout synchronously; textContent reads the tree and forces
     nothing. This question is asked from the observer pass about every message
     that has no button yet - which includes every thinking block and every tool
     call, on every burst, for as long as the transcript stays open - so on a long
     conversation those flushes cost more than the rest of the patch together. */
  function hasText(m) {
    return !!(bodyOf(m).textContent || "").trim();
  }
