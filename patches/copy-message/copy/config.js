<script nonce="${__NONCE__}">/* COPYMSG */(function(){
  /* A copy-to-clipboard icon for every chat message. Two placements:
       - user messages: inside the app's own "Message actions" container, next
         to the round rewind/fork button, wearing the app's actionButton class
         so it inherits that look and hover reveal exactly;
       - everything else: normal flow, on its own line at the end of the message.
     The app re-renders its message list constantly, so both the button and its
     placement are re-asserted from a MutationObserver rather than once at load.
     Sections: config + clipboard (here), button, placement + observer. */

  var MSG = ".__MSG__";          /* message_<hash> - one chat message wrapper */
  var USERMSG = ".__USERMSG__";  /* userMessage_<hash> - the user's text bubble */
  var ACTBTN = "__ACTBTN__";     /* the app's round message-actions button class */
  var ACTS = '[title="Message actions"]';
  var MD = ".__MD__";            /* root_<hash> - a rendered markdown span */
  var NOTTEXT = ".__THINK__,.__TOOLUSE__,.__TOOLRES__";   /* thinking / tool wrappers */

  /* Copy the message's own text: for a user message that is the bubble, which
     excludes the actions container (and its popup) sitting inside the wrapper. */
  function textOf(m) {
    return ((m.querySelector(USERMSG) || m).innerText || "").trim();
  }
